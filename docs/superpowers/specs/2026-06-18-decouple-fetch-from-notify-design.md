# Decouple Fetch from Notify

**Date:** 2026-06-18
**Status:** Design — awaiting review

## Problem

The `campwatch-notifier` worker runs one `run()` per cron fire on `* * * * *`,
but each run takes ~1.5–2 min because it fetches rec.gov inline (concurrency 1,
500 ms apart, 429s deferred to the next cycle). Since runs take longer than the
1-min cadence, **runs overlap**. That causes two real problems:

1. **Duplicate emails (state clobber).** `run()` reads each user's whole
   notifier-state at the top and overwrites it at the end. An overlapping run
   that read stale state, and didn't re-fetch a given campground that cycle,
   erases that campground's dedup ranges when it writes last — so the next fetch
   re-alerts. Low/normal-tier campgrounds (not fetched every minute) were the
   visible victims (e.g. Bull Trout Lake re-alerting every ~20 min). A
   server-side merge on `/api/admin/notifier-state` (commit e14cd4a) patched the
   symptom, but the overlap is the root cause and the same RMW pattern affects
   the snapshot, first-seen map, recent-openings log, and stats counters.
2. **rec.gov 429 storm.** Overlapping runs hit rec.gov as two concurrent
   streams, roughly doubling request rate. Logs show frequent 429s, each of
   which carries forward stale data and delays openings.

## Goal

Decouple the slow part (rec.gov fetch) from the fast part (diff + notify) so the
state-mutating notify pass makes zero upstream calls, completes sub-second, and
never overlaps. This removes the entire class of RMW races (not just the one
patched) and controls rec.gov load. Preserve ~1-min freshness on the user's
hot (high-tier) campgrounds.

## Decision summary

- **Structure (chosen): one worker, two cron patterns** (`campwatch-notifier`),
  dispatched on `controller.cron`. Not two workers, not a Durable Object.
- **Fetch strategy (chosen): fast lane for hot campgrounds.** High-tier (≤3,
  capped by `HIGH_PRIORITY_CAP`) fetched every minute in the tick; normal/low
  fetched by a slower sweep.
- **Fetch is driven by the watchlist, notify by eligibility.** The fetch jobs
  build their plans from *all* users' enabled campgrounds, so tier cadence is
  independent of any single user's notification frequency. (If fetch were gated
  by per-user eligibility, high-tier freshness would collapse to that user's
  frequency, e.g. 5 min — defeating the fast lane.) Decoupling tier cadence from
  notify cadence is the point.
- **The raw cache is the only seam.** Both fetch jobs write
  `recgov:{facilityId}:{month}`; notify only reads it.
- **Notify is cache-only** — no fallback fetch (that is what keeps it fast).

## Architecture

```
cron "* * * * *"   — TICK (every minute, stays fast)
   1. fast-lane fetch: high-tier campgrounds' due months -> putRaw (cache)
   2. notify: read cache (getRaw, no rec.gov) -> match-detect -> per-user diff
      -> email -> merge state -> first-seen / recent / stats / snapshot

cron "*/5 * * * *" — SWEEP (every 5 min, the slow part)
   shared fetch of normal/low-tier campgrounds' due months -> putRaw (cache)
   normal-tier: every sweep (5 min);  low-tier: every other sweep (minute % 10)
   best-effort single-flight guard (skip if a prior sweep is still running)
```

`controller.cron` distinguishes the two (`"* * * * *"` vs `"*/5 * * * *"`). The
`*/5` cadence maps cleanly onto the existing tiers: normal = 5 min → every
sweep, low = 10 min → every other sweep. High = 1 min stays in the tick's fast
lane. At minute 0 both fire as two separate `scheduled()` invocations; that is
expected (tick notifies, sweep only fetches).

The raw cache and snapshot cache already live in the worker's bound KV
namespace (`SUBSCRIBERS`), so no new bindings are required. The dashboard's
`/api/availability` route is untouched — it already reads the same raw cache and
rebuilds on miss.

## Components

Changed:
- **`notifier/worker.ts`** — `scheduled()` dispatches on `controller.cron`:
  `"* * * * *"` → `runTick()`, `"*/5 * * * *"` → `runSweep()`. Each passes
  `now = new Date(controller.scheduledTime)` as today.
- **`notifier/check.ts`** — split fetch from notify:
  - Extract `fetchToCache(plan, kvAdapter, opts)` — fetch each `(cg, month)` and
    `putRaw` (conditional-on-change). Used by both fast lane and sweep.
  - Add `readCachedMonths(plan, kvAdapter)` — assemble the `rawByCampground` map
    from `getRaw`; a cache miss is treated as no-data (carry-forward), never a
    fetch.
  - `run()` becomes notify-only: build the plan as the union of *eligible*
    users' campgrounds/months (no tier gate — reading cache is cheap, so notify
    considers every campground for a due user each tick), read cache, then the
    existing compute → diff → email → merge-state → first-seen/recent/stats
    path, unchanged. Eligibility (per-user `frequencyMinutes`) still gates which
    users are processed.

New:
- **Plan builders**: `buildFastLanePlan(targets, nowMonth)` (high-tier only) and
  `buildSweepPlan(targets, minute, nowMonth)` (normal/low, tier-gated to the
  sweep cadence). Both take *all* targets' enabled campgrounds (the watchlist,
  not the eligibility-filtered set) and reuse the month logic from today's
  `buildDedupedFetchPlan`.
- **Sweep single-flight guard**: a KV lease key (e.g. `notifier:sweep-lock`)
  written/checked at the top of `runSweep`; best-effort, since overlap here only
  costs a transient extra rec.gov stream, not correctness.

Unchanged: `match-detection`, `diffPerUser`, the notifier-state merge,
`lib/email`, the first-seen/recent/stats endpoints, the raw/snapshot caches and
KV adapters, the dashboard `/api/availability` route.

## Data flow

1. **Sweep** (`*/5`): build normal/low plan → `fetchToCache` → raw cache.
2. **Tick** (`* * * * *`):
   a. fast-lane: high-tier plan → `fetchToCache` → raw cache.
   b. notify: per eligible user, per campground/month → `readCachedMonths` →
      match-detect → diff vs notifier-state → email → merge state; update
      first-seen, recent-openings, stats; write snapshot.
3. **Dashboard** `/api/availability`: unchanged (snapshot, rebuild from raw
   cache on miss).

## Latency profile

- **High-tier:** ~1 min — fetched inline in the tick, notified the same run.
- **Normal/low:** ~ sweep interval + ≤1 min — fetched by the sweep, noticed by
  the next tick that reads cache. Acceptable for those tiers.

## Critical invariants

- **Notify makes zero rec.gov calls.** This is what guarantees sub-second,
  non-overlapping notify runs and therefore race-free per-user state writes.
- **Cache miss ≠ no availability** in notify: a missing `(cg, month)` is treated
  as carry-forward/no-data (same as today's `fetchProducedNoData` /
  `failedCampgroundIds`), never a reason to fetch inline.
- **Fetch jobs never touch per-user state** — they only `putRaw`. Overlapping
  fetches are therefore idempotent (same upstream data) and safe; the sweep lock
  is an optimization for rate-limiting, not correctness.

## Error handling

- A failed `fetchMonth` returns null → cache left as-is (1 h TTL) → notify
  carries forward last-good.
- Brand-new campground with a cold cache → omitted from alerts until the next
  fast-lane/sweep (or dashboard rebuild) fills it (≤5 min).
- Sweep lock contention → at worst a transient second rec.gov stream; benign.
- Defense in depth: notify still merges state (commit e14cd4a), so even a
  hypothetical overlap can't clobber.

## Testing

- Unit: `fetchToCache` (writes conditionally, handles null), `readCachedMonths`
  (miss → no-data, no fetch), cron dispatch in `worker.ts` (tick vs sweep),
  `buildFastLanePlan` / `buildSweepPlan` (tier filtering + sweep gating), sweep
  lock skip-when-held.
- Reuse existing match-detection / diff / merge tests unchanged.
- Behavioral: a tick with a pre-populated cache emits the expected emails; a
  tick with an empty cache emits none and does not crash or fetch.
- Run `tsc --noEmit` and `vitest` in `notifier/` manually (CI does not cover
  `notifier/`).

## Deploy / rollout

- Deployed via `wrangler deploy` from `notifier/` with personal CF creds
  (`.campwatch-personal-cf.env`); add the `*/5` trigger to `notifier/wrangler.jsonc`.
- Backward compatible: cache keys and notifier-state shape unchanged; no data
  migration. The cache is already warm (today's notifier writes it every cycle),
  so there is no cold-start alert gap at cutover.
- Verify post-deploy via observability logs: confirm tick runs stay short, sweep
  runs fetch on cadence, and 429s drop.

## Out of scope

- Durable Object / Queues-based scheduling (Approach C / two-worker split).
- Sub-minute latency.
- Fast-lane/sweep rec.gov coordination — deferred; add only if 429s persist
  after cutover.
- Hardening the first-seen/recent/stats/snapshot writes beyond what
  non-overlapping notify already gives for free.
