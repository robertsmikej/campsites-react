# Move Availability Fetches to the Backend

## Goals

- Remove all direct browser → recreation.gov calls from `/app` and `/discover`. Network tab should show one call to our own API instead of dozens to rec.gov.
- Share availability fetches across users via KV cache, so a campground watched by 50 users is fetched once per 5-min window, not 50 times.
- Collapse the two duplicated rec.gov fetch + match-detection implementations (`next/src/lib/recreation-gov.ts` and `notifier/lib/fetch-availability.ts`) into a single shared module used by both the notifier and the Next.js worker.

## Non-Goals

- Migrating the notifier off GitHub Actions into a Cloudflare Cron Trigger. The notifier stays in GHA for now; it just gains CF KV access via REST API. The cron-trigger migration is a possible follow-up.
- Streaming progress updates (SSE / chunked). Frontend loading state becomes a simple binary spinner.
- Streaming per-user updates. The dashboard refreshes on full page load / explicit refresh, not via WebSocket or polling.

## Architecture

```
┌─────────────────┐   every 5 min     ┌──────────────────┐
│ Notifier (GHA)  │ ────────────────► │ rec.gov API      │
│ check.ts        │                   └──────────────────┘
│                 │
│ For each user:  │  writes snapshot
│   fetch+process │ ────────────────► ┌──────────────────┐
│   diff vs last  │                   │ CF KV            │
│   email if new  │  writes raw       │  snapshot:{user} │
│                 │ ────────────────► │  recgov:{fac,mo} │
└─────────────────┘  per (fac,month)  └──────────────────┘
                                              ▲
                                              │ reads
┌─────────────────┐                           │
│ Browser         │  GET /api/                │
│ /app, /discover │ ──availability──┐         │
└─────────────────┘                 │         │
                                    ▼         │
                            ┌──────────────────┐
                            │ Next.js Worker   │
                            │ /api/avail.      │
                            │  read snapshot   │
                            │  fallback live   │
                            └──────────────────┘
```

Two KV key patterns:

- **`snapshot:{userEmail}`** — per-user processed result for logged-in users. Written by notifier (which already iterates signed-in targets every 5 min), read by dashboard. TTL 10 min (slightly longer than cron interval).
- **`recgov:{facilityId}:{month}`** — raw per-month rec.gov data. Shared across users and across notifier/worker contexts. TTL 5 min. This is the layer that anonymous `/discover` loads benefit from too.

Anonymous `/discover` visitors don't have a per-user snapshot (the notifier doesn't iterate the curated default config). They always go through the live-fetch path, but the underlying `recgov:{fac,month}` cache keeps it fast — typically all-hits since the notifier's user iterations populate the same raw cache for any campground in the curated default that any logged-in user also watches.

## Components

### Shared module: `next/src/lib/recgov/`

Pure TypeScript, no Next.js or Node-specific imports. Both notifier and worker import from here via relative path (same pattern the notifier already uses for `next/src/types/campground`).

- **`fetch-month.ts`** — `fetchMonth(facilityId, month) → RawMonthResult`. The one canonical rec.gov call. Includes the existing rec.gov URL format and error handling.
- **`match-detection.ts`** — `processCampgroundResults(rawResults, allDates, userPrefs) → SiteAvailabilityMap`. Pure function; runs `getAllDatesInRange`, `findConsecutiveAvailableRanges`, `filterNonOverlapping` and produces match results filtered by the user's stay-length and valid-start-day prefs.
- **`types.ts`** — shared types (`SiteAvailabilityMap`, `StayMatch`, `RawMonthResult`).
- **`cache.ts`** — wraps KV with the two key patterns. Exports a `KvWriter` / `KvReader` interface with two backends:
  - `WorkerKvWriter` — uses native CF KV binding via the existing `getKv()` helper.
  - `RestKvWriter` — POSTs to the Cloudflare KV REST API (`POST /accounts/{acct}/storage/kv/namespaces/{ns}/values/{key}`) using an API token. Used by the notifier in GitHub Actions.

### Backend route: `next/src/app/api/availability/route.ts`

`GET /api/availability` — accepts both logged-in and anonymous requests:

1. Read session. If logged in, snapshot key is `snapshot:{userEmail}` and the watchlist is the user's. If anonymous, no snapshot lookup; watchlist is the curated default config.
2. Try the snapshot key from KV (logged-in only).
3. **Hit** → return snapshot.
4. **Miss** (or anonymous) → live-fetch path:
   - Load watchlist (user's or curated default).
   - For each `(facility, month)` in the window, check `recgov:{fac,month}` cache → fetch rec.gov on miss → write back.
   - Run `processCampgroundResults` with the appropriate prefs.
   - Write the snapshot key (logged-in only).
   - Return result.

### Notifier changes: `notifier/check.ts`

- Drop `notifier/lib/fetch-availability.ts`, import from `../next/src/lib/recgov/`.
- After processing each user, write `snapshot:{userEmail}` to KV via `RestKvWriter`.
- Plumb `recgov:{fac,month}` cache through the per-month fetch loop so cache writes happen at fetch time.

### Frontend: `next/src/hooks/use-campgrounds-data.ts`

Rewrite as a single `fetch('/api/availability')` call. Drops the `fetchCampgrounds` import, the progress-callback plumbing, and the local-storage cache layer (server-side caching replaces it). Loading is binary — no progress bar.

Existing consumers (`next/src/app/app/page.tsx`, `next/src/app/discover/discover-client.tsx`) unchanged at the call site.

### Watchlist invalidation

Existing watchlist write routes (`POST/PUT/DELETE /api/users/me/campgrounds*`) add one line: `await kv.delete('snapshot:' + userEmail)`. User falls through to live fetch until next cron run.

### Removals

- `next/src/lib/recreation-gov.ts` — replaced by shared module + thin hook.
- `notifier/lib/fetch-availability.ts` — replaced by shared module imports.
- `notifier/lib/email.mjs`, `notifier/check.mjs` — dead pre-TS-migration artifacts.

## Secrets & Auth

Three new GitHub Actions secrets on the repo:

- `CLOUDFLARE_API_TOKEN` — scoped to **Workers KV Storage: Edit** on the campwatch namespace only. Created at Cloudflare → My Profile → API Tokens with a custom template.
- `CLOUDFLARE_ACCOUNT_ID` — account identifier (not a credential, but tidier in secrets).
- `CLOUDFLARE_KV_NAMESPACE_ID` — KV namespace identifier from `wrangler.jsonc`.

Workflow YAML references these via `${{ secrets.NAME }}`; the actual token values never appear in any committed file.

## Migration Plan

Six independently shippable steps:

1. **Extract shared module.** Copy fetch + match-detection into `next/src/lib/recgov/`. Wire the notifier to import from it. No behavior change. Verify cron still runs green.
2. **Add `recgov:{fac,month}` raw cache** in the shared module + plumb through the notifier's per-month fetches. Adds writes; no read path changes yet.
3. **Add backend route** `/api/availability` with snapshot read + live-fetch fallback. Snapshot writes don't exist yet, so every request hits the fallback path. This is the path that the frontend will exercise.
4. **Switch frontend hook** to call the route. Browser network tab no longer shows rec.gov.
5. **Notifier writes `snapshot:{userEmail}`** after processing each user. Dashboard loads hit warm snapshot cache.
6. **Watchlist invalidation** + delete dead code (`recreation-gov.ts`, `email.mjs`, `check.mjs`).

After step 4, the user-visible goal is met. Steps 5–6 improve cache hit rate and clean up.

## Risks & Tradeoffs

- **Cloudflare Workers concentration.** All rec.gov traffic now egresses from CF Worker IPs (shared pool across CF customers). Rate-limiting by IP would affect anyone using those IPs, not just CampWatch — making blanket blocks unlikely. More realistic risk is request-pattern detection (UA, cadence). Mitigation: custom UA, sane backoff, shared KV cache means we hit rec.gov at most once per (facility, month) per 5 min anyway.
- **Single-point-of-failure on next-worker for dashboard.** If the worker is down, dashboard can't load. Previously the dashboard fetched rec.gov directly so worker outages didn't affect availability data display. Acceptable: any worker outage already breaks auth, watchlist edits, and most of the app.
- **Snapshot freshness for new users / watchlist changes.** Up to 5 min lag until next cron run. Mitigated by live-fetch fallback path. First load for a brand-new user goes through live fetch synchronously.
- **GitHub Actions egress for notifier KV writes.** Notifier now makes additional outbound calls (CF KV REST API) on top of its rec.gov calls. Negligible — KV writes are fast and cheap.

## Open Questions

None — design approved by user 2026-05-28.
