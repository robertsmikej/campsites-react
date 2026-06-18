# Decouple Fetch from Notify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the notifier's slow rec.gov fetching from the fast notify pass so notify reads only from the KV raw cache, runs sub-second, and never overlaps — removing the per-user state race class and the 429 storm while keeping ~1-min freshness on high-tier campgrounds.

**Architecture:** One worker (`campwatch-notifier`), two cron triggers dispatched on `controller.cron`. The `* * * * *` tick does a fast-lane fetch of high-tier campgrounds then notifies from cache. The `*/5 * * * *` sweep fetches normal/low-tier campgrounds into cache. Both fetch jobs write `recgov:{id}:{month}`; notify only reads it. Fetch plans are built from the full watchlist (all enabled campgrounds); notify is gated by per-user `frequencyMinutes`.

**Tech Stack:** TypeScript, Cloudflare Workers (cron triggers, KV), Vitest, Wrangler. Notifier package at `notifier/`, consuming shared libs from `next/src/lib/recgov`.

## Global Constraints

- Personal project: use only personal accounts (`mikeroberts421@gmail.com`); never company Cloudflare/GitHub. Deploy creds come from sourcing `.campwatch-personal-cf.env` (personal token; bare wrangler = work OAuth).
- CI does NOT cover `notifier/` — run `cd notifier && npx tsc --noEmit` and `npx vitest run` manually before any deploy.
- Deploy is `cd notifier && wrangler deploy` (the worker), NOT the `next/` deploy workflow.
- Do not `git push` or deploy until the user explicitly approves (commit locally as you go).
- Commit messages end with: `Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB`
- Tier intervals are fixed in `next/src/types/campground.ts`: `CHECK_PRIORITY_INTERVAL_MINUTES = { high: 1, normal: 5, low: 10 }`. `HIGH_PRIORITY_CAP = 3`.
- Notify is cache-only: a cache miss is treated as no-data / carry-forward, never an inline fetch.
- Match the existing notifier test style: `vi.spyOn(globalThis, "fetch")` for HTTP, a `stubKv()` returning a `KvAdapter` of `vi.fn`s for KV.

---

## File Structure

- **Create `notifier/fetch-jobs.ts`** — pure plan builders + cache read/write helpers (no per-user state, no HTTP to our API). Keeps `check.ts` from growing further.
- **Create `notifier/fetch-jobs.test.ts`** — unit tests for the above.
- **Create `notifier/sweep-lock.ts`** — best-effort single-flight guard for the sweep.
- **Create `notifier/sweep-lock.test.ts`** — unit tests for the guard.
- **Modify `notifier/check.ts`** — remove inline fetching from the notify path; `run()` reads cache via `readCachedMonths`; add `fetchTargets()`, `runTick()`, `runSweep()`. Remove the now-unused `monthsBetween`/`buildDedupedFetchPlan`/`fetchDeduped`/`tierIntervalMinutes` (moved to `fetch-jobs.ts`).
- **Modify `notifier/check.test.ts`** — migrate the tier-fetch tests (now covered by plan-builder tests) and update the dry-run/scope tests to pre-populate the cache instead of mocking rec.gov.
- **Modify `notifier/worker.ts`** — dispatch on `controller.cron` to `runTick`/`runSweep`.
- **Modify `notifier/wrangler.jsonc`** — add the `*/5 * * * *` trigger.

---

## Task 1: Fetch-plan builders

**Files:**
- Create: `notifier/fetch-jobs.ts`
- Test: `notifier/fetch-jobs.test.ts`

**Interfaces:**
- Consumes: `CHECK_PRIORITY_INTERVAL_MINUTES`, `Campground`, `CheckPriority` from `next/src/types/campground`.
- Produces:
  - `interface FetchPlanItem { campgroundId: string; month: string }`
  - `interface PlannableTarget { campgrounds: { "recreation.gov"?: Campground[] } }`
  - `buildFastLanePlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[]`
  - `buildSweepPlan(targets: PlannableTarget[], minute: number, nowMonth: string): FetchPlanItem[]`
  - `buildNotifyPlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[]`

- [ ] **Step 1: Write the failing test**

Create `notifier/fetch-jobs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFastLanePlan, buildSweepPlan, buildNotifyPlan } from "./fetch-jobs";

function cg(id: string, checkPriority?: "high" | "normal" | "low", enabled = true) {
    return {
        id,
        name: id,
        enabled,
        ...(checkPriority ? { checkPriority } : {}),
        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
        sites: { favorites: [], worthwhile: [] },
    };
}
function target(cgs: ReturnType<typeof cg>[]) {
    return { campgrounds: { "recreation.gov": cgs } };
}
const NOW_MONTH = "2026-07";
const ids = (plan: { campgroundId: string }[]) => [...new Set(plan.map((p) => p.campgroundId))].sort();

describe("buildFastLanePlan", () => {
    it("includes only high-tier campgrounds", () => {
        const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low"), cg("D", "normal")])];
        expect(ids(buildFastLanePlan(t, NOW_MONTH))).toEqual(["H"]);
    });
    it("excludes disabled campgrounds", () => {
        const t = [target([cg("H", "high", false)])];
        expect(buildFastLanePlan(t, NOW_MONTH)).toEqual([]);
    });
});

describe("buildSweepPlan", () => {
    const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low")])];
    it("includes normal but not low on a %5 (not %10) minute", () => {
        expect(ids(buildSweepPlan(t, 5, NOW_MONTH))).toEqual(["N"]);
    });
    it("includes both normal and low on a %10 minute", () => {
        expect(ids(buildSweepPlan(t, 10, NOW_MONTH))).toEqual(["L", "N"]);
    });
    it("never includes high-tier", () => {
        expect(ids(buildSweepPlan(t, 0, NOW_MONTH))).toEqual(["L", "N"]);
    });
    it("treats a missing checkPriority as normal", () => {
        const t2 = [target([cg("X")])];
        expect(ids(buildSweepPlan(t2, 5, NOW_MONTH))).toEqual(["X"]);
    });
});

describe("buildNotifyPlan", () => {
    it("includes every enabled campground regardless of tier or minute", () => {
        const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low")])];
        expect(ids(buildNotifyPlan(t, NOW_MONTH))).toEqual(["H", "L", "N"]);
    });
    it("drops fully-past months but keeps the now-month", () => {
        const t = [target([{ ...cg("A", "low"), dates: { startDate: "2026-05-01", endDate: "2026-07-31" } }])];
        const months = buildNotifyPlan(t, "2026-07").map((p) => p.month);
        expect(months).toEqual(["2026-07"]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts`
Expected: FAIL — cannot resolve `./fetch-jobs`.

- [ ] **Step 3: Write minimal implementation**

Create `notifier/fetch-jobs.ts`:

```ts
import { CHECK_PRIORITY_INTERVAL_MINUTES } from "../next/src/types/campground";
import type { Campground, CheckPriority } from "../next/src/types/campground";

export interface FetchPlanItem {
    campgroundId: string;
    month: string;
}

export interface PlannableTarget {
    campgrounds: { "recreation.gov"?: Campground[] };
}

function monthsBetween(startIso: string, endIso: string): string[] {
    const start = new Date(startIso + "T00:00:00Z");
    const end = new Date(endIso + "T00:00:00Z");
    const months = new Set<string>();
    const cur = new Date(start);
    while (cur <= end) {
        months.add(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return [...months];
}

function tierOf(c: Campground): CheckPriority {
    return c.checkPriority ?? "normal";
}

// Shared core: union of (campgroundId, month) across targets for campgrounds
// whose tier is in `tiers`. When `minute` is provided, a campground is included
// only when minute % its-tier-interval === 0 (matches the legacy gate).
function buildPlan(
    targets: PlannableTarget[],
    tiers: CheckPriority[],
    nowMonth: string,
    minute?: number,
): FetchPlanItem[] {
    const ranges = new Map<string, Set<string>>();
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            const tier = tierOf(c);
            if (!tiers.includes(tier)) continue;
            if (minute !== undefined && minute % CHECK_PRIORITY_INTERVAL_MINUTES[tier] !== 0) continue;
            const start = c.dates?.startDate;
            const end = c.dates?.endDate;
            if (!start || !end) continue;
            const months = monthsBetween(start, end).filter((m) => m >= nowMonth);
            if (months.length === 0) continue;
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id)!.add(m);
        }
    }
    const plan: FetchPlanItem[] = [];
    for (const [campgroundId, monthSet] of ranges) for (const month of monthSet) plan.push({ campgroundId, month });
    return plan;
}

// High-tier only, every tick (high interval = 1, so no effective minute gate).
export function buildFastLanePlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["high"], nowMonth);
}

// Normal/low only, minute-gated. Runs under a */5 cron, so normal (5) fires every
// sweep and low (10) fires every other sweep.
export function buildSweepPlan(targets: PlannableTarget[], minute: number, nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["normal", "low"], nowMonth, minute);
}

// Every enabled campground, all due months, no gate — notify reads cache cheaply.
export function buildNotifyPlan(targets: PlannableTarget[], nowMonth: string): FetchPlanItem[] {
    return buildPlan(targets, ["high", "normal", "low"], nowMonth);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add notifier/fetch-jobs.ts notifier/fetch-jobs.test.ts
git commit -m "feat(notifier): tier-partitioned fetch-plan builders

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 2: `readCachedMonths` (notify reads cache)

**Files:**
- Modify: `notifier/fetch-jobs.ts`
- Test: `notifier/fetch-jobs.test.ts`

**Interfaces:**
- Consumes: `FetchPlanItem` (Task 1); `KvAdapter` from `next/src/lib/recgov/cache`; `RawMonthResult` from `next/src/lib/recgov/types`.
- Produces: `readCachedMonths(plan: FetchPlanItem[], kv: KvAdapter): Promise<Record<string, (RawMonthResult | null)[]>>` — one array per campgroundId, in plan order; a cache miss is a `null` slot. Output shape matches what `processCampgroundResults` consumes downstream.

- [ ] **Step 1: Write the failing test**

Append to `notifier/fetch-jobs.test.ts`:

```ts
import { readCachedMonths } from "./fetch-jobs";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

function kvWith(raw: Record<string, unknown>): KvAdapter {
    return {
        getRaw: async (id: string, month: string) => (raw[`${id}:${month}`] ?? null) as never,
        putRaw: async () => {},
        getSnapshot: async () => null,
        putSnapshot: async () => {},
        deleteSnapshot: async () => {},
    };
}

describe("readCachedMonths", () => {
    it("returns cached values per campground in plan order, null on miss", async () => {
        const kv = kvWith({
            "A:2026-07": { campsites: { "1": {} } },
            // A:2026-08 is a miss
            "B:2026-07": { campsites: {} },
        });
        const plan = [
            { campgroundId: "A", month: "2026-07" },
            { campgroundId: "A", month: "2026-08" },
            { campgroundId: "B", month: "2026-07" },
        ];
        const out = await readCachedMonths(plan, kv);
        expect(out.A).toEqual([{ campsites: { "1": {} } }, null]);
        expect(out.B).toEqual([{ campsites: {} }]);
    });

    it("returns an empty object for an empty plan", async () => {
        expect(await readCachedMonths([], kvWith({}))).toEqual({});
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts -t readCachedMonths`
Expected: FAIL — `readCachedMonths` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `notifier/fetch-jobs.ts` (imports at top, function at bottom):

```ts
import type { KvAdapter } from "../next/src/lib/recgov/cache";
import type { RawMonthResult } from "../next/src/lib/recgov/types";
```

```ts
// Assemble the per-campground raw-results map from the KV cache, preserving the
// plan's per-campground month order. A cache miss is a null slot — callers treat
// all-null as "no data" (carry-forward), never as a reason to fetch.
export async function readCachedMonths(
    plan: FetchPlanItem[],
    kv: KvAdapter,
): Promise<Record<string, (RawMonthResult | null)[]>> {
    const out: Record<string, (RawMonthResult | null)[]> = {};
    for (const { campgroundId, month } of plan) {
        const value = await kv.getRaw(campgroundId, month);
        (out[campgroundId] ??= []).push(value);
    }
    return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts -t readCachedMonths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add notifier/fetch-jobs.ts notifier/fetch-jobs.test.ts
git commit -m "feat(notifier): readCachedMonths — assemble raw results from KV cache

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 3: `fetchToCache` (the fetch jobs write the cache)

**Files:**
- Modify: `notifier/fetch-jobs.ts`
- Test: `notifier/fetch-jobs.test.ts`

**Interfaces:**
- Consumes: `FetchPlanItem`, `KvAdapter`, `fetchMonthWithCache` from `next/src/lib/recgov/fetch-with-cache`, `fetchDedupedConcurrent` from `next/src/lib/recgov/fetch-deduped`.
- Produces: `fetchToCache(plan: FetchPlanItem[], kv: KvAdapter, opts?: { concurrency?: number; delayMs?: number }): Promise<void>` — fetches each `(cg, month)` fresh and writes through to the cache (conditional-on-change inside the adapter). Side-effect only; returns nothing.

- [ ] **Step 1: Write the failing test**

Append to `notifier/fetch-jobs.test.ts`:

```ts
import { fetchToCache } from "./fetch-jobs";
import { vi } from "vitest";

vi.mock("../next/src/lib/recgov/fetch-month", () => ({
    fetchMonth: vi.fn(async (id: string, month: string) =>
        id === "FAIL" ? null : { campsites: { [`${id}-${month}`]: {} } },
    ),
}));

describe("fetchToCache", () => {
    it("writes fetched months to the cache and skips writes for failed fetches", async () => {
        const putRaw = vi.fn(async () => {});
        const kv: KvAdapter = {
            getRaw: async () => null,
            putRaw,
            getSnapshot: async () => null,
            putSnapshot: async () => {},
            deleteSnapshot: async () => {},
        };
        await fetchToCache(
            [
                { campgroundId: "A", month: "2026-07" },
                { campgroundId: "FAIL", month: "2026-07" },
            ],
            kv,
            { concurrency: 1, delayMs: 0 },
        );
        expect(putRaw).toHaveBeenCalledWith("A", "2026-07", { campsites: { "A-2026-07": {} } });
        expect(putRaw).not.toHaveBeenCalledWith("FAIL", "2026-07", expect.anything());
    });
});
```

(Note: `fetchMonthWithCache` with `forceFresh` calls `fetchMonth` then `kv.putRaw` on a non-null result. The mock above makes `fetchMonth` deterministic, so the assertion checks the write-through behavior.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts -t fetchToCache`
Expected: FAIL — `fetchToCache` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `notifier/fetch-jobs.ts`:

```ts
import { fetchMonthWithCache } from "../next/src/lib/recgov/fetch-with-cache";
import { fetchDedupedConcurrent } from "../next/src/lib/recgov/fetch-deduped";
```

```ts
// Fetch each (campground, month) fresh from rec.gov and write it through to the
// cache. Gentle footprint: serial with a throttle, no retries (a 429 just leaves
// last-good in cache for this cycle). Returns nothing — the cache is the output.
export async function fetchToCache(
    plan: FetchPlanItem[],
    kv: KvAdapter,
    opts?: { concurrency?: number; delayMs?: number },
): Promise<void> {
    if (plan.length === 0) return;
    await fetchDedupedConcurrent(
        plan,
        (campgroundId, month) => fetchMonthWithCache(campgroundId, month, kv, { forceFresh: true }),
        { concurrency: opts?.concurrency ?? 1, maxRetries: 0, delayMs: opts?.delayMs ?? 500 },
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts -t fetchToCache`
Expected: PASS.

- [ ] **Step 5: Run the whole fetch-jobs suite + typecheck**

Run: `cd notifier && npx vitest run fetch-jobs.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add notifier/fetch-jobs.ts notifier/fetch-jobs.test.ts
git commit -m "feat(notifier): fetchToCache — fresh fetch write-through to KV cache

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 4: Best-effort sweep single-flight guard

**Files:**
- Create: `notifier/sweep-lock.ts`
- Test: `notifier/sweep-lock.test.ts`

**Interfaces:**
- Produces:
  - `interface LockKv { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> }`
  - `acquireSweepLock(kv: LockKv, nowMs: number, leaseMs?: number): Promise<boolean>` — returns `true` if the caller may proceed (lock was free or stale) and writes a fresh lease; `false` if a fresh lease is already held. Best-effort (KV is eventually consistent).
- Note: `KVNamespace` satisfies `LockKv` structurally, so `worker.ts` can pass `env.SUBSCRIBERS` directly.

- [ ] **Step 1: Write the failing test**

Create `notifier/sweep-lock.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { acquireSweepLock } from "./sweep-lock";

function lockKv(initial?: string) {
    const store = new Map<string, string>();
    if (initial !== undefined) store.set("notifier:sweep-lock", initial);
    return {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    };
}
const LEASE = 4 * 60 * 1000;
const NOW = 1_781_790_000_000;

describe("acquireSweepLock", () => {
    it("acquires when no lock exists and writes the lease", async () => {
        const kv = lockKv();
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalledWith("notifier:sweep-lock", String(NOW), { expirationTtl: 300 });
    });
    it("refuses when a fresh lease is held", async () => {
        const kv = lockKv(String(NOW - 60_000)); // 1 min ago, within the 4-min lease
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(false);
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("acquires when the existing lease is stale", async () => {
        const kv = lockKv(String(NOW - LEASE - 1000)); // older than the lease
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalled();
    });
    it("acquires when the stored value is garbage", async () => {
        const kv = lockKv("not-a-number");
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd notifier && npx vitest run sweep-lock.test.ts`
Expected: FAIL — cannot resolve `./sweep-lock`.

- [ ] **Step 3: Write minimal implementation**

Create `notifier/sweep-lock.ts`:

```ts
export interface LockKv {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const LOCK_KEY = "notifier:sweep-lock";
const DEFAULT_LEASE_MS = 4 * 60 * 1000;

// Best-effort single-flight for the sweep. Returns true if the caller should run
// (and records a fresh lease), false if a non-stale lease is already held. KV is
// eventually consistent, so a rare double-acquire is possible — that only costs a
// transient extra rec.gov stream, never correctness (the fetch jobs are
// idempotent and touch no per-user state).
export async function acquireSweepLock(
    kv: LockKv,
    nowMs: number,
    leaseMs: number = DEFAULT_LEASE_MS,
): Promise<boolean> {
    const raw = await kv.get(LOCK_KEY);
    const heldAt = raw === null ? NaN : Number(raw);
    if (!Number.isNaN(heldAt) && heldAt + leaseMs > nowMs) return false;
    // TTL is a backstop so a crashed sweep can't wedge the lock forever.
    await kv.put(LOCK_KEY, String(nowMs), { expirationTtl: 300 });
    return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd notifier && npx vitest run sweep-lock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add notifier/sweep-lock.ts notifier/sweep-lock.test.ts
git commit -m "feat(notifier): best-effort sweep single-flight lock

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 5: Make `run()` notify-only; add `fetchTargets`, `runTick`, `runSweep`

**Files:**
- Modify: `notifier/check.ts`
- Test: `notifier/check.test.ts`

**Interfaces:**
- Consumes: `buildFastLanePlan`, `buildSweepPlan`, `buildNotifyPlan`, `readCachedMonths`, `fetchToCache` (Tasks 1–3); `acquireSweepLock` + `LockKv` (Task 4).
- Produces (new/changed exports on `check.ts`):
  - `run(config: RunConfig): Promise<void>` — unchanged signature, now notify-only (reads cache, never fetches rec.gov). Accepts an optional pre-fetched targets list to avoid a duplicate GET: `run(config: RunConfig, prefetchedTargets?: NotificationTarget[])`.
  - `runTick(config: RunConfig): Promise<void>` — fast-lane fetch high-tier → cache, then `run(config, targets)`.
  - `runSweep(config: RunConfig, lockKv: LockKv): Promise<void>` — acquire lock; if held, return; else sweep-fetch normal/low → cache.
- `RunConfig` is unchanged. `kvAdapter` must be non-null for fetch/cache reads; when null, `run` behaves as today (skips snapshot writes) and reads no cache (all carry-forward).

- [ ] **Step 1: Update the dry-run test to feed the cache instead of rec.gov**

In `notifier/check.test.ts`, the existing `stubKv()` returns `getRaw: async () => null`. With notify reading cache, the dry-run test must serve the fixture via `getRaw`. Replace the `stubKv` used in the dry-run test with one that returns `RECGOV_WITH_MATCH` for the watched campground/month. Edit the `run() dry-run` test's `const kv = stubKv();` to:

```ts
const kv = stubKv();
// Notify now reads the cache, not rec.gov: serve the match fixture via getRaw.
kv.getRaw = vi.fn(async (id: string, month: string) =>
    id === "232358" && month === "2026-07" ? (RECGOV_WITH_MATCH as never) : null,
);
```

Also, since notify no longer fetches rec.gov, delete the assertion that rec.gov was called if present, and keep the "would email" assertion (the match now comes from cache).

- [ ] **Step 2: Migrate the tier-fetch tests**

The `run()` tier tests ("fetches only high-tier on an off minute", "fetches high+normal on a %5 minute", "fetches all tiers on a %10 minute") asserted on `run()`'s inline fetch. That behavior now lives in the plan builders (covered by `fetch-jobs.test.ts` Task 1). Delete those three `it(...)` blocks and the `tierCampground`/`tierTarget` helpers if they become unused. Replace the "carries forward last-good snapshot data for campgrounds skipped this minute" test with a cache-miss version:

```ts
it("carries forward last-good snapshot for a campground missing from cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch([tierTarget([
        tierCampground("232358", "Outlet", "high"),
        tierCampground("999999", "Cold", "low"),
    ])]) as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const kv = stubKv();
    // Only 232358 is warm in cache; 999999 is a miss.
    kv.getRaw = vi.fn(async (id: string) => (id === "232358" ? (RECGOV_WITH_MATCH as never) : null));
    // Prior snapshot has a last-good entry for the cold campground.
    kv.getSnapshot = vi.fn(async () => ({
        updatedAt: "2026-07-05T00:00:00Z",
        campgrounds: [{ id: "999999", name: "Cold", siteAvailability: {}, totalSitesCount: 7 } as never],
    }));
    await run({
        subscriberApiUrl: "https://campwatch.dev",
        subscriberApiSecret: "secret",
        resendApiKey: "re_x",
        siteUrl: "https://campwatch.dev",
        forceEmail: false,
        dryRun: true,
        kvAdapter: kv,
        now: new Date("2026-07-06T00:00:00Z"),
    });
    const snap = (kv.putSnapshot as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as {
        campgrounds: { id: string; totalSitesCount: number }[];
    };
    const cold = snap.campgrounds.find((c) => c.id === "999999");
    expect(cold?.totalSitesCount).toBe(7); // carried forward, not zeroed
    void fetchSpy;
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd notifier && npx vitest run check.test.ts`
Expected: FAIL — `run` still fetches rec.gov / `runTick` not defined / cache not read. (Confirms the tests now drive the new behavior.)

- [ ] **Step 4: Refactor `check.ts` — extract `fetchTargets`, make `run` read cache, add `runTick`/`runSweep`**

In `notifier/check.ts`:

(a) Add imports near the top:

```ts
import { buildFastLanePlan, buildSweepPlan, buildNotifyPlan, readCachedMonths, fetchToCache } from "./fetch-jobs";
import { acquireSweepLock, type LockKv } from "./sweep-lock";
```

(b) Remove the now-unused `monthsBetween`, `tierIntervalMinutes`, `buildDedupedFetchPlan`, and `fetchDeduped` functions (moved to `fetch-jobs.ts`), plus the `CHECK_PRIORITY_INTERVAL_MINUTES` import and the `FetchPlanItem` interface if no longer referenced in `check.ts`.

(c) Extract the targets GET (current step 1 of `run`) into a helper:

```ts
async function fetchTargets(config: RunConfig): Promise<NotificationTarget[]> {
    const res = await fetch(`${config.subscriberApiUrl}/api/admin/notification-targets`, {
        headers: { Authorization: `Bearer ${config.subscriberApiSecret}` },
    });
    if (!res.ok) throw new Error(`notification-targets returned ${res.status}`);
    const { targets } = (await res.json()) as NotificationTargetsResponse;
    return targets;
}
```

(d) Change `run` to accept optional prefetched targets and read the cache. Replace the body from "1. Fetch targets" through the `const rawByCampground = await fetchDeduped(plan)` line with:

```ts
export async function run(config: RunConfig, prefetchedTargets?: NotificationTarget[]): Promise<void> {
    const { subscriberApiUrl, subscriberApiSecret, resendApiKey, siteUrl, forceEmail, dryRun, now } = config;
    kvAdapter = config.kvAdapter;

    if (!subscriberApiUrl || !subscriberApiSecret) throw new Error("Missing subscriberApiUrl/Secret");
    if (!resendApiKey) throw new Error("Missing resendApiKey");

    const targets = prefetchedTargets ?? (await fetchTargets(config));
    console.log(`[Targets] ${targets.length} users with non-empty campground lists`);

    const eligible = targets.filter((t) => isEligible(t, now, forceEmail));
    console.log(`[Eligible] ${eligible.length} users due for a check this cycle`);
    if (eligible.length === 0) {
        console.log("[Done] Nothing to do");
        return;
    }

    // Notify reads the KV cache only — no rec.gov calls. The cache is kept warm
    // by runTick (fast lane) and runSweep. A cache miss = carry-forward no-data.
    const nowMonth = now.toISOString().slice(0, 7);
    const plan = buildNotifyPlan(eligible, nowMonth);
    const rawByCampground = kvAdapter ? await readCachedMonths(plan, kvAdapter) : {};
    console.log(`[Notify] reading cache for ${plan.length} (campground, month) pairs`);
```

Leave everything from "5. Fetch the existing global first-seen map." onward unchanged (the `existingFirstSeenMap`, per-user compute/diff/email/merge-state, first-seen/recent/stats blocks all stay as-is).

(e) Add the two orchestrators at the end of the file:

```ts
// TICK (cron "* * * * *"): refresh hot campgrounds, then notify from cache.
export async function runTick(config: RunConfig): Promise<void> {
    const targets = await fetchTargets(config);
    const nowMonth = config.now.toISOString().slice(0, 7);
    if (config.kvAdapter && !config.dryRun) {
        const fastLane = buildFastLanePlan(targets, nowMonth);
        if (fastLane.length) {
            console.log(`[FastLane] fetching ${fastLane.length} high-tier (campground, month) pairs`);
            await fetchToCache(fastLane, config.kvAdapter, { concurrency: 1, delayMs: 250 });
        }
    }
    await run(config, targets);
}

// SWEEP (cron "*/5 * * * *"): refresh normal/low campgrounds into cache. Fetch
// only — no notify. Best-effort single-flight so overlapping sweeps don't double
// the rec.gov load.
export async function runSweep(config: RunConfig, lockKv: LockKv): Promise<void> {
    if (!config.kvAdapter || config.dryRun) return;
    if (!(await acquireSweepLock(lockKv, config.now.getTime()))) {
        console.log("[Sweep] prior sweep still holds the lock — skipping");
        return;
    }
    const targets = await fetchTargets(config);
    const nowMonth = config.now.toISOString().slice(0, 7);
    const minute = config.now.getUTCMinutes();
    const plan = buildSweepPlan(targets, minute, nowMonth);
    if (plan.length === 0) {
        console.log(`[Sweep] minute=${minute} — no normal/low campgrounds due`);
        return;
    }
    console.log(`[Sweep] minute=${minute} fetching ${plan.length} (campground, month) pairs`);
    await fetchToCache(plan, config.kvAdapter, { concurrency: 1, delayMs: 500 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd notifier && npx vitest run check.test.ts`
Expected: PASS — dry-run reaches "would email" from cache; cache-miss carry-forward holds.

- [ ] **Step 6: Typecheck + full notifier suite**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all suites pass (`fetch-jobs`, `sweep-lock`, `check`, `cooldown-dedup`, `lib/*`).

- [ ] **Step 7: Commit**

```bash
git add notifier/check.ts notifier/check.test.ts
git commit -m "refactor(notifier): run() is notify-only, reads KV cache; add runTick/runSweep

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 6: Wire the two crons in `worker.ts` + `wrangler.jsonc`

**Files:**
- Modify: `notifier/worker.ts`
- Modify: `notifier/wrangler.jsonc`
- Test: `notifier/worker.test.ts` (create)

**Interfaces:**
- Consumes: `runTick`, `runSweep` from `./check`; `WorkerKvAdapter` from `../next/src/lib/recgov/worker-kv`.
- Produces: default export with `scheduled(controller, env, ctx)` dispatching on `controller.cron`.

- [ ] **Step 1: Write the failing test**

Create `notifier/worker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const runTick = vi.fn(async () => {});
const runSweep = vi.fn(async () => {});
vi.mock("./check", () => ({ runTick, runSweep }));
vi.mock("../next/src/lib/recgov/worker-kv", () => ({ WorkerKvAdapter: class {} }));

import worker from "./worker";

const env = {
    SUBSCRIBERS: { get: async () => null, put: async () => {} },
    RESEND_API_KEY: "re_x",
    SUBSCRIBER_API_SECRET: "secret",
    SUBSCRIBER_API_URL: "https://campwatch.dev",
    SITE_URL: "https://campwatch.dev",
    DRY_RUN: "false",
} as never;
const ctx = { waitUntil: (p: Promise<unknown>) => p } as never;

beforeEach(() => {
    runTick.mockClear();
    runSweep.mockClear();
});

describe("worker scheduled dispatch", () => {
    it("runs the tick (fast-lane + notify) on the every-minute cron", async () => {
        await worker.scheduled({ cron: "* * * * *", scheduledTime: 1_781_790_000_000 } as never, env, ctx);
        expect(runTick).toHaveBeenCalledTimes(1);
        expect(runSweep).not.toHaveBeenCalled();
    });
    it("runs the sweep on the */5 cron", async () => {
        await worker.scheduled({ cron: "*/5 * * * *", scheduledTime: 1_781_790_000_000 } as never, env, ctx);
        expect(runSweep).toHaveBeenCalledTimes(1);
        expect(runTick).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd notifier && npx vitest run worker.test.ts`
Expected: FAIL — current `worker.ts` calls `run`, not `runTick`/`runSweep`, and doesn't dispatch on `controller.cron`.

- [ ] **Step 3: Rewrite `worker.ts`**

Replace `notifier/worker.ts` with:

```ts
import { runTick, runSweep } from "./check";
import { WorkerKvAdapter } from "../next/src/lib/recgov/worker-kv";
import type { KVNamespace, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
    SUBSCRIBERS: KVNamespace;
    RESEND_API_KEY: string;
    SUBSCRIBER_API_SECRET: string;
    SUBSCRIBER_API_URL: string;
    SITE_URL?: string;
    DRY_RUN?: string;
}

export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        const config = {
            subscriberApiUrl: env.SUBSCRIBER_API_URL,
            subscriberApiSecret: env.SUBSCRIBER_API_SECRET,
            resendApiKey: env.RESEND_API_KEY,
            siteUrl: env.SITE_URL ?? "",
            forceEmail: false,
            dryRun: env.DRY_RUN === "true",
            kvAdapter: new WorkerKvAdapter(env.SUBSCRIBERS as never),
            // scheduledTime keeps the minute stable across slow starts.
            now: new Date(controller.scheduledTime),
        };
        // Two cron patterns, distinguished by controller.cron:
        //   "* * * * *"   -> tick: fast-lane fetch (high-tier) + notify from cache
        //   "*/5 * * * *" -> sweep: fetch normal/low-tier into cache
        if (controller.cron === "*/5 * * * *") {
            ctx.waitUntil(runSweep(config, env.SUBSCRIBERS as never));
        } else {
            ctx.waitUntil(runTick(config));
        }
    },
};
```

- [ ] **Step 4: Add the sweep cron to `wrangler.jsonc`**

In `notifier/wrangler.jsonc`, change the `triggers.crons` array to:

```jsonc
        "crons": ["* * * * *", "*/5 * * * *"],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd notifier && npx vitest run worker.test.ts`
Expected: PASS — tick on `* * * * *`, sweep on `*/5 * * * *`.

- [ ] **Step 6: Full verify (typecheck + all notifier tests)**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: no type errors; every suite passes.

- [ ] **Step 7: Commit**

```bash
git add notifier/worker.ts notifier/worker.test.ts notifier/wrangler.jsonc
git commit -m "feat(notifier): two-cron dispatch — tick (fast-lane+notify) and */5 sweep

Claude-Session: https://claude.ai/code/session_01A1amNP5w5ZXKZgHBviq7MB"
```

---

## Task 7: Deploy + live verification (gated on user approval)

**Files:** none (operational).

- [ ] **Step 1: Final local verification**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 2: Get explicit user approval to deploy** (per Global Constraints, do not deploy without it).

- [ ] **Step 3: Deploy the worker with personal creds**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier
set -a && . ../.campwatch-personal-cf.env && set +a
npx wrangler deploy
```

Expected: deploy succeeds; `wrangler deployments list` shows two cron triggers (`* * * * *`, `*/5 * * * *`).

- [ ] **Step 4: Verify live via observability (first ~10 min)**

Query the worker logs (see `reference_campwatch_notifier_overlapping_runs` for the observability query). Confirm:
- Tick runs log `[FastLane] …` then `[Notify] reading cache …` and finish in a few seconds (not ~2 min).
- Sweep runs log `[Sweep] minute=… fetching …` on `*/5` minutes; low-tier only on `minute % 10 == 0`.
- rec.gov `HTTP 429` lines drop sharply versus before.
- No campground re-alerts within the cooldown (watch a low-tier campground across two sweeps).

- [ ] **Step 5: Push** (only after the user confirms live behavior is good)

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Two-cron structure (tick + sweep) → Tasks 5–6. ✓
- Fast lane for high-tier, sweep for normal/low, `*/5` cadence → Tasks 1, 5, 6. ✓
- Fetch driven by watchlist, notify by eligibility → Task 1 (`buildFastLanePlan`/`buildSweepPlan` take all targets; `buildNotifyPlan` used inside `run` after the eligibility filter). ✓
- Cache as the only seam; notify cache-only → Tasks 2, 5 (`readCachedMonths`, `run` reads cache). ✓
- Cache miss = carry-forward, no inline fetch → Task 5 Step 2 test + `readCachedMonths` null slots. ✓
- Best-effort sweep single-flight → Task 4. ✓
- Error handling (failed fetch leaves cache; cold cache omits) → Tasks 3, 5. ✓
- Deploy via notifier wrangler + personal creds + manual tests → Task 7 + Global Constraints. ✓
- Defense-in-depth (state merge stays) → unchanged code, noted in spec. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands. ✓

**Type consistency:** `FetchPlanItem`, `PlannableTarget`, `readCachedMonths`, `fetchToCache`, `acquireSweepLock`/`LockKv`, `runTick`, `runSweep`, `run(config, prefetchedTargets?)` are named identically across the tasks that define and consume them. `KVNamespace` structurally satisfies `LockKv` (used in Task 6). ✓
