# Notifier cron reliability — decision record

**Date:** 2026-06-05
**Status:** Writeup only — no implementation yet (Mike weighing a Workers Paid upgrade)

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

## Evidence

- Workers Free CPU limit: 10 ms/invocation. Paid: up to 5 min (HTTP) / 15 min
  (Cron Triggers); no wall-clock duration limit. I/O (fetch/KV/delays) does not
  count toward CPU. (Cloudflare Workers Limits / Cron Triggers / Pricing docs.)
- Repo `robertsmikej/campsites-react` is public → unlimited free Actions minutes.
- Notifier deps: none (devDeps only: tsx/typescript/prettier). Uses native
  `fetch`, `node:crypto.createHmac`, Resend via REST.
