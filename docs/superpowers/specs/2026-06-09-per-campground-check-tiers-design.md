# Per-Campground Check Tiers

**Date:** 2026-06-09
**Status:** Approved

## Problem

The notifier checks every watched campground on the same 5-minute cron. Some campgrounds matter a lot (a specific trip coming up) and deserve faster detection; others barely matter and could be checked less often. We want per-campground check frequency without increasing the overall rec.gov footprint enough to risk 429s again (the old 1-minute burst-fetch cadence got rate-limited).

## Decision summary

- Three fixed tiers per campground: **high** = every 1 min, **normal** = every 5 min (default), **low** = every 10 min.
- 1 minute is the floor: it is also Cloudflare cron's minimum granularity, rec.gov's CDN-cached availability data isn't meaningfully fresher than that, and sub-minute polling multiplies ban risk for ~15s of median latency gain.
- **High tier is capped at 3 campgrounds**, enforced in the UI and the save API.
- Scheduling approach: **single 1-minute cron + minute-modulo filter** in the fetch-plan builder (chosen over multiple cron triggers or Durable Object alarms — no new infra, tiers are just data).

## Data model

`Campground` (next/src/types/campground.ts) gains:

```ts
checkPriority?: "high" | "normal" | "low";
```

- Absent ⇒ `"normal"`. No migration needed for existing watch data.
- A shared exported constant maps tier → interval minutes: `{ high: 1, normal: 5, low: 10 }`.
- High-tier cap constant: `3`.

## Scheduler changes (notifier/)

1. **wrangler.jsonc:** cron `*/5 * * * *` → `* * * * *`.
2. **worker.ts:** pass `new Date(controller.scheduledTime)` as `now` instead of `new Date()`, so minute math is exact and drift-free.
3. **check.ts `buildDedupedFetchPlan()`:** takes the current minute; includes a campground only when `minute % tierIntervalMinutes(campground) === 0`.
   - The plan is already a union across eligible users, so a campground watched at different tiers by different users naturally gets the fastest applicable tier.
   - At minutes 0/10/20/30/40/50 all tiers coincide; existing (campground, month) dedup keeps each fetch single.
   - Off-minutes with no high-tier campgrounds produce an empty plan and the run is a near-no-op (one targets-API call, zero rec.gov requests).
4. Log the tier breakdown per run for observability, e.g. `[Plan] minute=7 high=2 → 4 fetches`.

## Critical invariant: "not checked this cycle" ≠ "no availability"

On minutes where a campground's tier doesn't fire, it is **skipped**, not empty. Skipped campgrounds must take the same path as failed fetches (the existing `failedCampgroundIds` carry-forward):

- User snapshots carry forward the last-good data for skipped campgrounds (no clobbering with `totalSitesCount: 0`).
- Diff/dedup state for skipped campgrounds is left untouched (already true: openings only prune after the 24h cooldown, and absence doesn't close them out — but tests must pin this).

Without this, dashboards and dedup state would be corrupted 4 of every 5 minutes.

## UI (next/)

In the campground editor (site-config-dialog/campground-editor.tsx), next to notify scope:

- A "Check frequency" select: **High — every minute / Normal — every 5 min (default) / Low — every 10 min**.
- When the user already has 3 High campgrounds, the High option is disabled with a "High tier full — 3 max" hint.
- The campground save API validates the cap server-side (reject >3 high per user) as defense in depth.

## User-record interaction

`frequencyMinutes` on the user record acts as a post-email pause: after an email is sent, ALL of that user's checks stop until it elapses. No code change — but as part of rollout, check Mike's live record and set `frequencyMinutes` to 1 so high-tier rechecks aren't muzzled immediately after an alert.

## Footprint / cost

- Worst case high tier (3 campgrounds × ~2 months): ~6 rec.gov requests/min, serialized 500ms apart, no retries — well under the burst pattern that previously triggered 429s.
- KV writes rise to roughly 300–400k/month — within the Workers Paid included quota.
- Every-minute cron invocations and the per-minute targets-API call are negligible.

## Testing

- **notifier (vitest):**
  - Tier filtering in `buildDedupedFetchPlan` at representative minutes (0, 1, 5, 7, 10): high always included; normal only on %5; low only on %10; default (absent field) behaves as normal.
  - Skipped-campground carry-forward: a campground excluded from the plan retains its prior snapshot and dedup state.
- **next:** save-API cap validation (4th high rejected); editor disables High at the cap if component-test patterns exist for this dialog.
- Notifier is NOT covered by CI — run `tsc` + `vitest` in notifier/ manually before deploy.

## Deploy

- Worker: `wrangler deploy` from notifier/ (personal Cloudflare account).
- Next app: deploys on push (note: deploy-next.yml deploys prod from ANY branch push).
- Order: deploy the worker and the next app together — the new field is optional and ignored by old code, so there's no hard ordering constraint, but the cron change should land with the modulo filter in the same deploy (a 1-minute cron without the filter would check everything every minute).

## Out of scope

- Sub-minute checking (Durable Object alarms).
- Auto-demotion of high-tier campgrounds on 429 (revisit if 429s actually appear).
- Per-site (rather than per-campground) frequency — fetch granularity is campground-month, so per-site is impossible without more requests.
