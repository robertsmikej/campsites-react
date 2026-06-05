# Notifier → Cloudflare Scheduled Worker (Option B)

**Date:** 2026-06-05
**Status:** Design — awaiting review

## Problem

The notifier runs on GitHub Actions `schedule: '*/5'`, which GitHub throttles to
~hourly (≈9/10 polls dropped). That delays the core product — opening-detection
emails. CampWatch is now on Cloudflare Workers Paid, so we can move the poll to a
native CF **Cron Trigger** (reliable, 1-min granularity) and parallelize the
rec.gov fetches. Background + A/B comparison + scale ceilings:
`docs/notifier-cron-reliability.md`.

## Goal

Run the notifier as a standalone Cloudflare **Scheduled Worker** on a 1-minute
cron, with bounded-concurrency fetches, reaching ~30–60s open→inbox. Cut over
from GitHub Actions safely (no duplicate emails, no state races) via a dry-run
verification phase. Sub-minute (Durable Object alarms) is explicitly out of scope.

## Architecture

A new Worker `campwatch-notifier` with its own `notifier/wrangler.jsonc` and a
`scheduled()` handler on `crons = ["* * * * *"]`. It reuses all existing notifier
(`notifier/lib/*`) and shared (`next/src/lib/recgov/*`) code. Deployment stays in
GitHub Actions via `wrangler deploy` (only the *schedule* moves to CF cron; the
throttling affected `schedule:` triggers, not deploys).

Rejected alternatives: adding a `scheduled()` handler to the OpenNext app Worker
(OpenNext owns that entry — messy); rewriting the notifier into the app (larger,
couples notifier to the web tier).

## Components & boundaries

- **`notifier/src/worker.ts`** (new, thin): the Worker entry.
  ```ts
  export default {
    async scheduled(event, env, ctx) {
      ctx.waitUntil(run(configFromEnv(env)));
    },
  };
  ```
  Its only job is to build a `RunConfig` from Worker bindings and call `run()`.

- **`run(config: RunConfig)`** (extracted from the current `main()` in
  `check.ts`): the full orchestration, with NO `process.env` reads and NO
  `process.exit`. All inputs are injected via `config`. Returns a summary
  (counts) and throws on fatal misconfiguration.

  ```ts
  interface RunConfig {
    subscriberApiUrl: string;
    subscriberApiSecret: string;
    resendApiKey: string;
    siteUrl: string;
    forceEmail: boolean;
    dryRun: boolean;
    kvAdapter: KvAdapter | null;
    now: Date;
  }
  ```

- **CLI entry** (`check.ts` keeps a thin `main()`): reads `process.env`, builds a
  `RunConfig` with `RestKvAdapter`, calls `run()`, maps failure to
  `process.exit(1)`. Preserves local/manual runs.

- **KV**: the Worker injects `new WorkerKvAdapter(env.SUBSCRIBERS)` (native
  binding); the CLI injects `RestKvAdapter`. `run()` is adapter-agnostic.

- **App state stays over HTTP**: targets, first-seen, per-user state,
  recent-openings, and stats continue to use the app's admin endpoints with the
  Bearer `SUBSCRIBER_API_SECRET` (works unchanged in a Worker). The KV binding is
  used only for the raw month cache and per-user snapshots.

- **`fetchDedupedConcurrent(plan, opts)`** (replaces `fetchDeduped`'s sequential
  500 ms loop): runs fetches with **≤6 in-flight** (matches the Workers
  simultaneous-connection limit) and **retries on 429/5xx with exponential
  backoff** (e.g., 3 tries, 500ms→1s→2s). No fixed inter-fetch delay. Returns the
  same `Record<campgroundId, unknown[]>` shape, so downstream code is unchanged.

- **`node:crypto.createHmac`** (email unsubscribe signature): kept, relying on
  the `nodejs_compat` flag in the notifier Worker's wrangler config (same flag the
  app Worker already uses).

## Configuration (`notifier/wrangler.jsonc`)

- `name: "campwatch-notifier"`, `main: "src/worker.ts"`,
  `compatibility_flags: ["nodejs_compat"]`, `compatibility_date` current.
- `triggers.crons: ["* * * * *"]` (1 minute).
- `kv_namespaces`: bind `SUBSCRIBERS` to the existing namespace id
  `41a67a8b06044ee38f0bf22cfbcc069d`.
- `vars`: `DRY_RUN` ("true" during Phase 1), `SITE_URL`, `SUBSCRIBER_API_URL`.
- Secrets (via `wrangler secret put` / Actions): `RESEND_API_KEY`,
  `SUBSCRIBER_API_SECRET`.

## Data flow (per cron tick)

CF 1-min cron → `scheduled()` → `run()`:
1. Fetch `/api/admin/notification-targets` (HTTP, Bearer).
2. Filter eligible (enabled + frequency; `forceEmail` bypass).
3. Build deduped `(campground, month)` plan.
4. `fetchDedupedConcurrent` → rec.gov via KV-cached fetch (≤6 concurrent + backoff).
5. Fetch global first-seen map (HTTP).
6. Compute match signatures, first-seen, curator lead-time.
7. Per-user diff → new matches.
8. **If `!dryRun`**: send emails (Resend HTTP); write per-user state, first-seen,
   recent-openings, `lastNotifiedAt` (HTTP).
9. Write per-user snapshots (KV binding) — runs in both modes (idempotent, safe).

## Cutover (dry-run → flip)

- **Phase 1 — shadow.** Deploy `campwatch-notifier` with `DRY_RUN=true` + 1-min
  cron. The GitHub Actions cron keeps running and remains the source of truth for
  emails and state. The Worker fetches + computes + **logs the matches it would
  email** and writes snapshots, but sends nothing and mutates no state. Compare
  the Worker's Cloudflare logs against an Actions run over ~2 cycles to confirm
  parity (same users, same match counts).
- **Phase 2 — flip (one change).** Set the Worker `DRY_RUN=false` AND remove the
  `schedule:` trigger from `.github/workflows/check-campsites.yml` (keep
  `workflow_dispatch` for manual runs). Only the Worker notifies thereafter.
- **Rollback.** Re-add the Actions `schedule:` and set the Worker back to
  `DRY_RUN=true` (or remove its cron).

## Error handling

- Per-user processing is isolated: one user's failure is logged and skipped, the
  run continues for others.
- Total/partial fetch failure for a campground → the shipped snapshot
  carry-forward preserves last-good data (no zeroing).
- rec.gov 429/5xx → bounded retries with backoff; give up after N and treat as a
  failed fetch for that campground (carried forward).
- `scheduled()` wraps `run()` in `ctx.waitUntil`; uncaught errors surface in
  Cloudflare Workers observability (already enabled on the account).
- Missing required config (secret/URL) → `run()` throws; logged, no partial sends.

## Testing

The `run()` / `fetchDedupedConcurrent()` extraction makes the notifier
unit-testable for the first time:
- `fetchDedupedConcurrent`: with a mock fetch — respects the ≤6 concurrency cap,
  retries on 429/5xx then succeeds, gives up after N and reports the campground as
  no-data, preserves result shape/order grouping.
- `run()` in `dryRun`: with injected mock adapter + a fetch spy — performs the
  reads and computes matches, but sends NO email and issues NO state-mutating
  writes (assert the email sender and the state/first-seen/recent-openings
  endpoints are never called).
- `run()` non-dry-run happy path: sends for eligible users with new matches;
  writes state.
- `configFromEnv`: maps bindings correctly; `DRY_RUN` string "true" → boolean.
- Shared `recgov` lib already covered (incl. `fetchProducedNoData`).

Local pre-flight: run the CLI entry against prod with `DRY_RUN=true` to eyeball
parity before Phase 1.

## Out of scope (YAGNI)

- Sub-minute alerts via Durable Object alarms (revisit if rec.gov tolerates it).
- Moving the admin HTTP endpoints' logic into the Worker / direct-KV reads.
- Sharding fetches across invocations (only needed at many-campground scale;
  rec.gov rate-limiting is the governing ceiling, ~30–50 campgrounds at 1-min).
- Parallelizing per-user processing (it's CPU-cheap; fetch is the bottleneck).
