# Notifier → Cloudflare Scheduled Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the CampWatch notifier as a native Cloudflare Scheduled Worker on a 1-minute cron (reliable cadence, parallel fetches), replacing the throttled GitHub Actions `schedule:` cron, cutting over via a dry-run verification phase.

**Architecture:** Extract the notifier orchestration from `check.ts`'s `main()` into a pure-ish `run(config)` with injected config + KV adapter and a `dryRun` flag that gates all writes. A thin `cli.ts` (Node/Actions entry) and a thin `worker.ts` (CF `scheduled()` entry) both call `run()`. The concurrency+backoff fetch helper lives in the shared `recgov` lib. Deploy via GitHub Actions `wrangler deploy`; only the schedule moves to CF cron.

**Tech Stack:** Cloudflare Workers (Cron Triggers, KV binding), TypeScript, Vitest, wrangler. Spec: `docs/superpowers/specs/2026-06-05-notifier-cloudflare-scheduled-worker-design.md`.

**Commands:** `next/` tests via `cd next && pnpm test`. Notifier tests via `cd notifier && pnpm test`. Notifier type-check `cd notifier && pnpm typecheck`. Notifier format `cd notifier && pnpm format`.

**Branch / push policy (CampWatch):** commit locally on `main`; do NOT `git push` — Mike pushes/deploys. Tasks 6–7 are operational (Mike-run, touch prod + the live cutover).

---

## File Map

**Create:**
- `next/src/lib/recgov/fetch-deduped.ts` — `fetchDedupedConcurrent()`: bounded-concurrency + retry/backoff fan-out over a `(campground, month)` plan. Shared, unit-tested in `next/`.
- `next/src/lib/recgov/fetch-deduped.test.ts`
- `notifier/cli.ts` — Node/Actions entry: build `RunConfig` from `process.env` (+ `RestKvAdapter`), call `run()`, `process.exit(1)` on failure.
- `notifier/worker.ts` — CF Worker entry: `scheduled()` builds `RunConfig` from bindings (+ `WorkerKvAdapter`) and calls `run()`.
- `notifier/wrangler.jsonc` — Worker config: name, cron, KV binding, `nodejs_compat`, vars.
- `notifier/vitest.config.ts` — notifier test runner.
- `notifier/check.test.ts` — unit test: `run({dryRun:true})` performs no writes.

**Modify:**
- `next/src/lib/recgov/index.ts` — export `fetch-deduped`.
- `notifier/check.ts` — export `run(config)`; remove top-level `main()` execution; gate writes on `dryRun`; swap `fetchDeduped` → `fetchDedupedConcurrent`; `kvAdapter` becomes a `let` assigned from config.
- `notifier/package.json` — add devDeps (`vitest`, `@cloudflare/workers-types`, `wrangler`); add `test` script; point `check`/`dev` at `cli.ts`.
- `.github/workflows/check-campsites.yml` — run `cli.ts` (not `check.ts`); later (Task 7) remove the `schedule:` trigger.
- `.github/workflows/deploy-next.yml` — add a job to deploy the notifier Worker.

---

## Task 1: `fetchDedupedConcurrent` in the shared recgov lib

**Files:**
- Create: `next/src/lib/recgov/fetch-deduped.ts`, `next/src/lib/recgov/fetch-deduped.test.ts`
- Modify: `next/src/lib/recgov/index.ts`

- [ ] **Step 1: Write the failing test**

Create `next/src/lib/recgov/fetch-deduped.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchDedupedConcurrent, type FetchPlanItem } from "./fetch-deduped";

const plan: FetchPlanItem[] = [
    { campgroundId: "A", month: "2026-07" },
    { campgroundId: "A", month: "2026-08" },
    { campgroundId: "B", month: "2026-07" },
];

it("returns results grouped by campground, preserving month order", async () => {
    const fetchOne = vi.fn(async (id: string, month: string) => ({ id, month }));
    const out = await fetchDedupedConcurrent(plan, fetchOne, { concurrency: 2, maxRetries: 0 });
    expect(out["A"]).toEqual([
        { id: "A", month: "2026-07" },
        { id: "A", month: "2026-08" },
    ]);
    expect(out["B"]).toEqual([{ id: "B", month: "2026-07" }]);
});

it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { ok: true };
    });
    const big: FetchPlanItem[] = Array.from({ length: 10 }, (_, i) => ({
        campgroundId: "A",
        month: `2026-${String(i + 1).padStart(2, "0")}`,
    }));
    await fetchDedupedConcurrent(big, fetchOne, { concurrency: 3, maxRetries: 0, backoffMs: [] });
    expect(maxInFlight).toBeLessThanOrEqual(3);
});

it("retries on null then succeeds", async () => {
    let calls = 0;
    const fetchOne = vi.fn(async () => {
        calls++;
        return calls < 2 ? null : { ok: true };
    });
    const out = await fetchDedupedConcurrent([{ campgroundId: "A", month: "2026-07" }], fetchOne, {
        concurrency: 1,
        maxRetries: 2,
        backoffMs: [0, 0],
    });
    expect(out["A"]).toEqual([{ ok: true }]);
    expect(calls).toBe(2);
});

it("gives up after maxRetries and records null", async () => {
    const fetchOne = vi.fn(async () => null);
    const out = await fetchDedupedConcurrent([{ campgroundId: "A", month: "2026-07" }], fetchOne, {
        concurrency: 1,
        maxRetries: 2,
        backoffMs: [0, 0],
    });
    expect(out["A"]).toEqual([null]);
    expect(fetchOne).toHaveBeenCalledTimes(3); // initial + 2 retries
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd next && pnpm test src/lib/recgov/fetch-deduped.test.ts`
Expected: FAIL — `Cannot find module './fetch-deduped'`.

- [ ] **Step 3: Write the implementation**

Create `next/src/lib/recgov/fetch-deduped.ts`:

```ts
export interface FetchPlanItem {
    campgroundId: string;
    month: string;
}

export interface FetchDedupedOptions {
    /** Max fetches in flight at once. Keep ≤ 6 (Workers connection limit). */
    concurrency?: number;
    /** Retries after the initial attempt when the fetch returns null. */
    maxRetries?: number;
    /** Backoff before each retry, ms; index clamps to last entry. */
    backoffMs?: number[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every (campground, month) in the plan with bounded concurrency and
 * retry-on-null backoff. `fetchOne` returns the raw result or null on failure
 * (rec.gov error / network). Results are grouped by campgroundId, preserving the
 * per-campground month order of the plan. A campground that never succeeds gets
 * a null in its slot (callers treat all-null as "no data").
 */
export async function fetchDedupedConcurrent<T>(
    plan: FetchPlanItem[],
    fetchOne: (campgroundId: string, month: string) => Promise<T | null>,
    options: FetchDedupedOptions = {},
): Promise<Record<string, (T | null)[]>> {
    const concurrency = Math.max(1, options.concurrency ?? 6);
    const maxRetries = Math.max(0, options.maxRetries ?? 2);
    const backoffMs = options.backoffMs ?? [500, 1000];

    // Pre-size per-campground result arrays so out-of-order completion still
    // lands each result at its correct month index.
    const slotIndex: number[] = [];
    const results: Record<string, (T | null)[]> = {};
    for (const { campgroundId } of plan) {
        if (!results[campgroundId]) results[campgroundId] = [];
        slotIndex.push(results[campgroundId].length);
        results[campgroundId].push(null);
    }

    let next = 0;
    async function worker(): Promise<void> {
        while (next < plan.length) {
            const i = next++;
            const item = plan[i]!;
            let value: T | null = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                value = await fetchOne(item.campgroundId, item.month);
                if (value !== null) break;
                if (attempt < maxRetries) {
                    await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)] ?? 0);
                }
            }
            results[item.campgroundId]![slotIndex[i]!] = value;
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, plan.length) }, () => worker()));
    return results;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd next && pnpm test src/lib/recgov/fetch-deduped.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export it**

In `next/src/lib/recgov/index.ts`, add after the `raw-results` export:

```ts
export * from "./fetch-deduped";
```

- [ ] **Step 6: Type-check + commit**

Run: `cd next && pnpm exec tsc --noEmit` (expect clean), then:

```bash
git add next/src/lib/recgov/fetch-deduped.ts next/src/lib/recgov/fetch-deduped.test.ts next/src/lib/recgov/index.ts
git commit -m "Add fetchDedupedConcurrent: bounded-concurrency rec.gov fetch with backoff"
```

---

## Task 2: Notifier test + Worker tooling

**Files:**
- Modify: `notifier/package.json`
- Create: `notifier/vitest.config.ts`

- [ ] **Step 1: Add devDeps and scripts**

In `notifier/package.json`, add to `devDependencies`: `"vitest": "^3.0.0"`, `"@cloudflare/workers-types": "^4.0.0"`, `"wrangler": "^4.0.0"`. Add to `scripts`: `"test": "vitest run"`, and change `"check": "tsx cli.ts"` and `"dev": "tsx cli.ts"` (entry moves to `cli.ts`, created in Task 3).

Then run `cd notifier && npm install`.

- [ ] **Step 2: Add vitest config**

Create `notifier/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["**/*.test.ts"],
    },
});
```

- [ ] **Step 3: Verify the runner works**

Run: `cd notifier && pnpm test` (or `npm test`).
Expected: passes with "no test files found" (no tests yet) — exit 0. If it errors on config, fix the config before proceeding.

- [ ] **Step 4: Commit**

```bash
git add notifier/package.json notifier/vitest.config.ts notifier/package-lock.json
git commit -m "Notifier: add vitest + workers-types + wrangler tooling"
```

---

## Task 3: Extract `run(config)`; add `cli.ts`; gate writes on dryRun

**Files:**
- Modify: `notifier/check.ts`
- Create: `notifier/cli.ts`, `notifier/check.test.ts`
- Modify: `.github/workflows/check-campsites.yml`

- [ ] **Step 1: Write the failing test**

Create `notifier/check.test.ts`. It mocks global `fetch` to satisfy the read endpoints and rec.gov, passes a stub `KvAdapter`, runs `run({dryRun:true})`, and asserts NO write endpoint or Resend call happened.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { run } from "./check";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

function stubKv(): KvAdapter {
    return {
        getRaw: vi.fn(async () => null),
        putRaw: vi.fn(async () => {}),
        getSnapshot: vi.fn(async () => null),
        putSnapshot: vi.fn(async () => {}),
        deleteSnapshot: vi.fn(async () => {}),
    };
}

const target = {
    email: "boss@example.com",
    roles: ["curator"],
    notifications: { enabled: true, frequencyMinutes: 0 },
    campgrounds: {
        "recreation.gov": [
            {
                id: "232358",
                name: "Outlet",
                enabled: true,
                dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                sites: { favorites: [], worthwhile: [] },
            },
        ],
    },
    globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
    notifierState: { signatures: [] },
};

function mockFetch() {
    return vi.fn(async (url: string | URL, _init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/admin/notification-targets")) {
            return new Response(JSON.stringify({ targets: [target] }), { status: 200 });
        }
        if (u.includes("/api/admin/first-seen")) {
            return new Response(JSON.stringify({}), { status: 200 });
        }
        if (u.includes("/api/openings/recent")) {
            return new Response(JSON.stringify([]), { status: 200 });
        }
        if (u.includes("recreation.gov")) {
            return new Response(JSON.stringify({ campsites: {} }), { status: 200 });
        }
        // Any other URL = a write/send we must NOT make in dry-run.
        return new Response("{}", { status: 200 });
    });
}

describe("run() dry-run", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("reads + computes but performs no writes or sends", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch() as never);

        await run({
            subscriberApiUrl: "https://campwatch.dev",
            subscriberApiSecret: "secret",
            resendApiKey: "re_x",
            siteUrl: "https://campwatch.dev",
            forceEmail: false,
            dryRun: true,
            kvAdapter: stubKv(),
            now: new Date("2026-07-02T00:00:00Z"),
        });

        const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
        // Reads happened:
        expect(calledUrls.some((u) => u.includes("/api/admin/notification-targets"))).toBe(true);
        // No write/send happened:
        expect(calledUrls.some((u) => u.includes("api.resend.com"))).toBe(false);
        expect(
            calledUrls.some(
                (u) =>
                    u.includes("/api/admin/notifier-state") ||
                    u.includes("/api/admin/openings/recent") ||
                    u.includes("/api/admin/stats"),
            ),
        ).toBe(false);
        // first-seen PUT must not happen (GET is fine); assert no PUT method to first-seen:
        const firstSeenWrites = fetchSpy.mock.calls.filter(
            (c) => String(c[0]).includes("/api/admin/first-seen") && (c[1] as RequestInit)?.method === "PUT",
        );
        expect(firstSeenWrites).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd notifier && pnpm test check.test.ts`
Expected: FAIL — `run` is not exported from `./check` (and check.ts still auto-runs `main()` on import).

- [ ] **Step 3: Refactor `check.ts` — export `run(config)`, remove auto-exec, gate writes**

Make these exact changes in `notifier/check.ts`:

1. Add the config type near the top (after the existing interfaces):

```ts
import type { KvAdapter } from "../next/src/lib/recgov/cache";

export interface RunConfig {
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

2. Change the module-global KV from a const to a reassignable let, and drop the env-based init here (it moves to `cli.ts`):

   Replace:
   ```ts
   const kvAdapter = buildKvAdapter();
   ```
   with:
   ```ts
   let kvAdapter: KvAdapter | null = null;
   ```
   Keep the `buildKvAdapter()` function definition (now only called by `cli.ts`); export it: `export function buildKvAdapter()...`.

3. Add `fetchDedupedConcurrent` import and rewrite `fetchDeduped` to use it:

   Add to imports:
   ```ts
   import { fetchDedupedConcurrent } from "../next/src/lib/recgov/fetch-deduped";
   ```
   Replace the body of `fetchDeduped(plan)` with:
   ```ts
   async function fetchDeduped(plan: FetchPlanItem[]): Promise<Record<string, unknown[]>> {
       const byCampground = new Map<string, string[]>();
       for (const { campgroundId, month } of plan) {
           if (!byCampground.has(campgroundId)) byCampground.set(campgroundId, []);
           byCampground.get(campgroundId)!.push(month);
       }
       for (const [id, months] of byCampground) {
           console.log(`[Fetch] Campground ${id}: ${months.length} month(s) to fetch`);
       }
       return fetchDedupedConcurrent(
           plan,
           (campgroundId, month) =>
               kvAdapter
                   ? fetchMonthWithCache(campgroundId, month, kvAdapter, { forceFresh: true })
                   : fetchMonth(campgroundId, month),
           { concurrency: 6, maxRetries: 2, backoffMs: [500, 1000] },
       );
   }
   ```
   (Delete the old sequential loop and the `DELAY_BETWEEN_FETCHES_MS` constant + `delay` import usage if now unused — leave `delay` if used elsewhere.)

4. Convert `main()` to `export async function run(config: RunConfig)`:
   - Change the signature: `async function main(): Promise<void> {` → `export async function run(config: RunConfig): Promise<void> {`.
   - At the very top of the body, replace the `process.env` reads:
     ```ts
     const { subscriberApiUrl, subscriberApiSecret, resendApiKey, siteUrl, forceEmail, dryRun, now } = config;
     kvAdapter = config.kvAdapter;
     ```
   - Replace the `process.exit(1)` validation blocks (missing URL/secret, missing RESEND key) with throws:
     ```ts
     if (!subscriberApiUrl || !subscriberApiSecret) throw new Error("Missing subscriberApiUrl/Secret");
     if (!resendApiKey) throw new Error("Missing resendApiKey");
     ```
   - Replace the remaining two `process.exit(1)` calls (the `notification-targets` non-OK branch) with `throw new Error(...)`.

5. Gate the five writes on `!dryRun`:
   - **Email send** (the `await sendEmailToUser({...})` block in the per-user loop): wrap so dry-run logs instead of sends:
     ```ts
     if (dryRun) {
         console.log(`[dry-run] would email ${newMatches.length} match(es) to ${target.email}`);
         updates.push({ email: target.email, state: nextState });
     } else {
         const sentAtMs = Date.now();
         await sendEmailToUser({ user: target, matches: newMatches, resendApiKey, siteUrl, apiSecret: subscriberApiSecret });
         for (const m of newMatches) {
             const sig = signatureForMatch(m);
             const firstSeenIso = newFirstSeenMap[sig];
             if (firstSeenIso) sentLatenciesMs.push(sentAtMs - new Date(firstSeenIso).getTime());
         }
         updates.push({ email: target.email, state: nextState, lastNotifiedAt: now.toISOString() });
     }
     ```
     (Keep the existing `try/catch` around the non-dry-run branch.)
   - **notifier-state PUT** (step 8 `fetch(.../api/admin/notifier-state ...)`): wrap the whole block in `if (!dryRun) { ... }`.
   - **first-seen PUT** (`await putFirstSeenMap(...)`): wrap in `if (!dryRun) await putFirstSeenMap(...)`.
   - **recent-openings PUT** (the `fetch(.../api/admin/openings/recent ...)` try/catch block): wrap in `if (!dryRun) { ... }`.
   - **stats PUT** (step 10, the stats compute + `fetch(.../api/admin/stats ...)`): wrap the PUT in `if (!dryRun)`. (Computing stats is fine; just don't PUT them in dry-run.)
   - At the end, in dry-run add: `if (dryRun) console.log("[dry-run] complete — no writes performed");`

6. Remove the top-level execution at the bottom of the file:
   ```ts
   main().catch((err) => { ... process.exit(1); });
   ```
   Delete it (the CLI entry in `cli.ts` now owns invocation).

- [ ] **Step 4: Create the CLI entry**

Create `notifier/cli.ts`:

```ts
import { run, buildKvAdapter, type RunConfig } from "./check";

async function main(): Promise<void> {
    const config: RunConfig = {
        subscriberApiUrl: process.env.SUBSCRIBER_API_URL ?? "",
        subscriberApiSecret: process.env.SUBSCRIBER_API_SECRET ?? "",
        resendApiKey: process.env.RESEND_API_KEY ?? "",
        siteUrl: process.env.SITE_URL ?? "",
        forceEmail: process.env.FORCE_EMAIL === "true",
        dryRun: process.env.DRY_RUN === "true",
        kvAdapter: buildKvAdapter(),
        now: new Date(),
    };
    await run(config);
}

main().catch((err) => {
    console.error("[Fatal]", err);
    process.exit(1);
});
```

(`buildKvAdapter` and `RunConfig` must be exported from `check.ts` per Step 3.)

- [ ] **Step 5: Point the Actions workflow at the new entry**

In `.github/workflows/check-campsites.yml`, change the final run step `run: npx tsx check.ts` to `run: npx tsx cli.ts`. (Leave the `schedule:` trigger in place for now — it's removed in Task 7.)

- [ ] **Step 6: Run the test + type-check**

Run: `cd notifier && pnpm test check.test.ts` (expect PASS), then `cd notifier && pnpm typecheck` (expect clean).

- [ ] **Step 7: Commit**

```bash
git add notifier/check.ts notifier/cli.ts notifier/check.test.ts .github/workflows/check-campsites.yml
git commit -m "Notifier: extract run(config) with dry-run gating; add cli.ts entry"
```

---

## Task 4: Worker entry + wrangler config

**Files:**
- Create: `notifier/worker.ts`, `notifier/wrangler.jsonc`

- [ ] **Step 1: Create the Worker entry**

Create `notifier/worker.ts`:

```ts
import { run } from "./check";
import { WorkerKvAdapter } from "../next/src/lib/recgov/worker-kv";
import type { KVNamespace } from "@cloudflare/workers-types";

interface Env {
    SUBSCRIBERS: KVNamespace;
    RESEND_API_KEY: string;
    SUBSCRIBER_API_SECRET: string;
    SUBSCRIBER_API_URL: string;
    SITE_URL?: string;
    DRY_RUN?: string;
}

export default {
    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(
            run({
                subscriberApiUrl: env.SUBSCRIBER_API_URL,
                subscriberApiSecret: env.SUBSCRIBER_API_SECRET,
                resendApiKey: env.RESEND_API_KEY,
                siteUrl: env.SITE_URL ?? "",
                forceEmail: false,
                dryRun: env.DRY_RUN === "true",
                kvAdapter: new WorkerKvAdapter(env.SUBSCRIBERS),
                now: new Date(),
            }),
        );
    },
};
```

- [ ] **Step 2: Create the wrangler config**

Create `notifier/wrangler.jsonc`:

```jsonc
{
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "campwatch-notifier",
    "main": "worker.ts",
    "compatibility_date": "2026-05-14",
    "compatibility_flags": ["nodejs_compat"],
    "triggers": {
        "crons": ["* * * * *"]
    },
    "kv_namespaces": [
        {
            "binding": "SUBSCRIBERS",
            "id": "41a67a8b06044ee38f0bf22cfbcc069d"
        }
    ],
    "vars": {
        "DRY_RUN": "true",
        "SITE_URL": "https://campwatch.dev",
        "SUBSCRIBER_API_URL": "https://campwatch.dev"
    },
    "observability": {
        "enabled": true
    }
}
```

(`DRY_RUN` starts `"true"` for the Phase-1 shadow. `RESEND_API_KEY` and `SUBSCRIBER_API_SECRET` are Worker **secrets**, set in Task 5 — not committed here. Confirm `SITE_URL`/`SUBSCRIBER_API_URL` match the values in the existing GitHub secrets before relying on them.)

- [ ] **Step 3: Verify it builds (dry-run deploy)**

Run: `cd notifier && npx wrangler deploy --dry-run --outdir /tmp/cw-notifier-build`
Expected: bundles successfully (resolves `run`, `WorkerKvAdapter`, `node:crypto` under `nodejs_compat`). Fix any bundling/type error before committing. Do NOT do a real deploy here.

- [ ] **Step 4: Type-check + commit**

Run: `cd notifier && pnpm typecheck` (expect clean), then:

```bash
git add notifier/worker.ts notifier/wrangler.jsonc
git commit -m "Notifier: add Cloudflare scheduled Worker entry + wrangler config (1-min cron, DRY_RUN)"
```

---

## Task 5: Deploy the notifier Worker from GitHub Actions

**Files:**
- Modify: `.github/workflows/deploy-next.yml`

- [ ] **Step 1: Add a deploy job for the notifier Worker**

In `.github/workflows/deploy-next.yml`, add a second job (sibling to `deploy`):

```yaml
    deploy-notifier:
        runs-on: ubuntu-latest
        defaults:
            run:
                working-directory: notifier
        steps:
            - uses: actions/checkout@v5
            - uses: actions/setup-node@v5
              with:
                  node-version: 22
            - name: Install notifier dependencies
              run: npm install
            - name: Deploy notifier Worker
              uses: cloudflare/wrangler-action@v4
              with:
                  apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
                  accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
                  workingDirectory: notifier
                  command: deploy
                  secrets: |
                      RESEND_API_KEY
                      SUBSCRIBER_API_SECRET
              env:
                  RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
                  SUBSCRIBER_API_SECRET: ${{ secrets.SUBSCRIBER_API_SECRET }}
```

(`wrangler-action`'s `secrets:` input pushes those as Worker secrets on each deploy. The KV binding + vars come from `wrangler.jsonc`. Note: the notifier worker bundles `../next/src/...` — confirm the checkout includes `next/` (it does; full repo checkout) and that wrangler bundles cross-dir imports.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-next.yml
git commit -m "CI: deploy campwatch-notifier Worker on push"
```

- [ ] **Step 3: Full local verification before any push**

Run all of:
- `cd next && pnpm exec tsc --noEmit && pnpm test && pnpm format:check`
- `cd notifier && pnpm typecheck && pnpm test && pnpm format:check`
- `cd notifier && npx wrangler deploy --dry-run --outdir /tmp/cw-notifier-build`

All must pass. (`pnpm format` first if `format:check` complains — CI gates on Prettier.)

---

## Task 6: Phase 1 — shadow deploy + verify (operational, Mike-run)

**Files:** none.

- [ ] **Step 1: Push + deploy**

Push `main`. The `deploy` job ships the app; the new `deploy-notifier` job ships `campwatch-notifier` with `DRY_RUN=true` + 1-min cron. The GitHub Actions `check-campsites.yml` cron is still the real notifier.

- [ ] **Step 2: Confirm the Worker is live and shadowing**

Cloudflare dashboard → Workers & Pages → `campwatch-notifier` → Logs (observability). Within ~1–2 min you should see scheduled invocations logging `[Targets] …`, `[Fetch] …`, and `[dry-run] would email …` / `[dry-run] complete — no writes performed`. Confirm **no** `[Email] Sending` lines and no state-write warnings.

- [ ] **Step 3: Verify parity vs the Actions run**

Compare a `campwatch-notifier` invocation's computed match counts against a recent `Check Campsite Availability` Actions run (`gh run view <id> --log`). Same eligible users and same per-user match counts ⇒ parity. Let it shadow for a few cycles. Confirm the dashboard still shows correct availability (snapshots written by both are consistent).

---

## Task 7: Phase 2 — flip (operational, Mike-run)

**Files:**
- Modify: `notifier/wrangler.jsonc`, `.github/workflows/check-campsites.yml`

- [ ] **Step 1: Flip the Worker out of dry-run**

In `notifier/wrangler.jsonc`, set `"DRY_RUN": "false"`.

- [ ] **Step 2: Disable the Actions cron**

In `.github/workflows/check-campsites.yml`, remove (or comment out) the `schedule:` block under `on:`, keeping `workflow_dispatch` so manual/`cli.ts` runs still work.

- [ ] **Step 3: Commit + push (coordinated cutover)**

```bash
git add notifier/wrangler.jsonc .github/workflows/check-campsites.yml
git commit -m "Notifier cutover: Worker live (DRY_RUN=false); disable Actions cron"
```

Push. After deploy, the Worker is the sole notifier. Confirm in its logs that real `[Email] Sending` / state writes now occur, and that `Check Campsite Availability` no longer runs on a schedule.

- [ ] **Step 4: Rollback (only if needed)**

Re-add the `schedule:` trigger to `check-campsites.yml` and set `DRY_RUN` back to `"true"` in `wrangler.jsonc`; commit + push.

---

## Self-Review Notes

- **Spec coverage:** standalone Worker + cron (Tasks 4–5) ✓; `run()` extraction with injected config + adapter (Task 3) ✓; HTTP-for-app-state / KV-binding-for-cache+snapshots (Task 3 keeps HTTP; worker.ts injects WorkerKvAdapter) ✓; `fetchDedupedConcurrent` ≤6 + backoff (Task 1) ✓; dry-run gates all five writes (Task 3 Step 3.5) ✓; cutover dry-run→flip (Tasks 6–7) ✓; nodejs_compat for node:crypto (Task 4) ✓; testing (Tasks 1, 3) ✓; deploy via Actions (Task 5) ✓.
- **Type consistency:** `RunConfig` fields identical across `check.ts`, `cli.ts`, `worker.ts`, and the test; `fetchDedupedConcurrent(plan, fetchOne, opts)` signature consistent between Task 1 and its use in Task 3; `KvAdapter` is the shared interface from `recgov/cache`.
- **Layout note:** the spec sketched `notifier/src/worker.ts`; this plan uses `notifier/worker.ts` (flat, matching `notifier/check.ts`). Imports of `../next/src/...` are unchanged by that choice.
- **Placeholders:** none — new files have full code; the `run()` extraction gives exact old→new transformations with the five gated write sites enumerated.
