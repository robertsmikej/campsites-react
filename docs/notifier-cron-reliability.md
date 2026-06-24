# Notifier cron reliability — decision record

**Date:** 2026-06-05
**Status:** RESOLVED — implemented on Workers Paid. The notifier was migrated off the GitHub Actions `schedule:` cron to the `campwatch-notifier` Cloudflare Worker on Cron Triggers (1-min tick + 5-min sweep; see `notifier/worker.ts`). `check-campsites.yml` is now manual-only. The problem writeup below is retained as the decision record.

## Problem

The notifier runs via GitHub Actions `schedule: '*/5 * * * *'`
(`.github/workflows/check-campsites.yml`). GitHub `schedule:` triggers are
best-effort and get delayed/dropped under load. Observed cadence: ~24 runs in a
day with gaps of 70 min to 3+ hours, versus the 288/day a true `*/5` implies —
roughly **9 of every 10 polls never fire**. Not a config bug; it's the platform.
Cost: email latency (the core promise) degrades from minutes to hours.

(The dashboard *staleness* was a separate bug, already fixed: failed fetches no
longer poison the snapshot, and the dashboard refetches on change/focus.)

## Two levers on "as quick as possible"

1. **Cadence** — how often the poll runs. This is the throttling problem.
   Fixed by either option below.
2. **Per-poll duration** — the poll itself does ~65 sequential rec.gov fetches
   with a 500 ms delay between each (~32 s of delay alone). Independent of
   cadence; addressable by bounded concurrency / smaller delay. Worth doing
   alongside whichever option, especially if chasing low latency.

## Options

Both fix cadence (CF cron triggers are reliable; `workflow_dispatch` runs are
not deprioritized like `schedule:`).

### A — CF cron Worker → GitHub `workflow_dispatch`
A tiny scheduled Worker calls GitHub's workflow_dispatch API every 5 min; the
existing notifier runs unchanged.
- Effort: ~30–60 min, no notifier changes.
- Plan: any (trigger Worker is <1 ms CPU). **Works on Free.**
- Cost: $0 (repo is public → free Actions minutes).
- New parts: a GitHub fine-grained PAT (Actions: write) as a Worker secret.
- Trade-offs: still two systems; ~20–40 s runner spin-up + `npm install` per
  run before the poll starts; PAT rotation.

### B — Port the notifier to a CF Scheduled Worker
Run the poll/diff/email logic in a Worker `scheduled()` handler with the native
KV binding and a CF cron trigger.
- Effort: ~half-day port + testing.
- Plan: **requires Paid.** The notifier JSON-parses ~65 rec.gov responses +
  diffs → well over the Free **10 ms CPU** cap. Paid cron triggers allow up to
  **15 min CPU** and have no wall-clock limit (so the inter-fetch delays are
  fine; could also poll every 1 min).
- Cost: $0 if already Paid; else $5/mo.
- Upsides: single system, no runner spin-up (lower latency), no PAT, no Actions
  minutes, faster start.
- Trade-offs: migration risk; lose Actions logs (use Workers observability,
  already enabled).

Portability is favorable: the notifier is **dependency-free** (native `fetch` +
`node:crypto`, which works under the existing `nodejs_compat` flag), Resend is
already a REST call, and `WorkerKvAdapter` (native KV binding) already exists.
The port is mostly: `process.env` → env bindings, `process.exit` → return/throw,
`RestKvAdapter` → `WorkerKvAdapter`, a separate wrangler project + cron trigger,
and Worker secrets.

## Recommendation

- **Upgrading to Paid (your current lean):** do **B**. It's the native,
  single-system, lowest-latency answer, and on Paid the CPU limit is a
  non-issue. Pair it with parallelizing the rec.gov fetches and optionally a
  1-min cron for genuinely fast alerts.
- **Staying on Free:** do **A** — reliable cadence at $0 and near-zero risk.
- A now / B after the upgrade is also fine; A is fully reversible.

## Speed & scale potential (Paid + B, with parallel fetches)

### How fast

End-to-end "site opens → email lands" budget:

| Stage | Time |
|---|---|
| Wait for next poll (cron granularity) | up to 60s (avg ~30s) — **dominates** |
| Poll: ~65 fetches parallel at 6-wide | ~5–6s (vs ~32s sequential today) |
| Diff + snapshot | <1s |
| Resend email | ~1s |

- **Detection → email: ~5–8s** (the README's "<10s" — real and achievable).
- **Open → inbox: ~30–60s**, governed by the **1-minute cron floor**, not compute.
- Sub-minute requires **Durable Object alarms** (self-reschedule every ~15–30s)
  → ~15–30s open→inbox. Below that, diminishing returns: can't beat rec.gov's
  own publish cadence, and faster polling just risks blocks. Floor ≈ 15–30s,
  set by rec.gov, not Cloudflare.
- The 6-simultaneous-connections rule sets the ~6-wide parallelism (shapes poll
  duration, not a hard cap).

### How many campgrounds

Design point: fetches are **deduped by unique `(campground, month)` across all
users**, so users are nearly free — cost scales with **unique campgrounds**.

Ceilings, first to bite:

1. **rec.gov rate-limiting — the real governor (undocumented).** Requests/poll ≈
   campgrounds × ~5 active months: 13 cg ≈ 65, 50 cg ≈ 250, 100 cg ≈ 500. At a
   1-min cron that's 65→500 req/min to an unofficial API from CF egress IPs.
   Estimate comfortable in the low hundreds per poll → **~30–50 campgrounds at
   aggressive 1-min cadence** before risking 429s/blocks. Needs empirical
   probing (start conservative, watch for 429s, add backoff).
2. **Cloudflare (Paid) — not close.** Subrequests 10,000/invocation default
   (~800–1000 campgrounds at ~10–12 subreq each), raisable to millions; cron CPU
   15 min (parsing thousands = a few seconds); no wall-clock cap.
3. **KV writes** — ~1 snapshot/user/poll + changed raw months. Fine on Paid
   (per-op billing, cheap here); would blow Free's 1,000 writes/day immediately.

To push past ~50 campgrounds: shard campgrounds across staggered invocations (or
Queues), back off on 429s, keep active-window month trimming + change-only raw
caching (both already present), slower cadence for less-hot campgrounds. Then CF
scales to many hundreds; rec.gov tolerance stays the ceiling.

**Tension:** speed and scale draw from the same rec.gov budget — polling faster
*and* watching more campgrounds both raise request rate. Sweet spot: modest
concurrency (~4–6) + 429 backoff + 1-min cron.

**Bottom line:** ~30–60s alerts today on a 1-min cron; ~15–30s with DO alarms;
~30–50 unique campgrounds before rec.gov (not Cloudflare) forces sharding.

## Evidence

- Workers Free CPU limit: 10 ms/invocation. Paid: up to 5 min (HTTP) / 15 min
  (Cron Triggers); no wall-clock duration limit. I/O (fetch/KV/delays) does not
  count toward CPU. (Cloudflare Workers Limits / Cron Triggers / Pricing docs.)
- Repo `robertsmikej/campsites-react` is public → unlimited free Actions minutes.
- Notifier deps: none (devDeps only: tsx/typescript/prettier). Uses native
  `fetch`, `node:crypto.createHmac`, Resend via REST.
- Subrequests (Paid): 10,000/invocation default (raised Feb 2026), configurable
  up to 10M. Free: 50 external + 1,000 to CF services. Up to 6 connections may be
  "waiting for headers" simultaneously.
- Cron Triggers: minimum granularity 1 minute. Sub-minute needs Durable Object
  alarms.
