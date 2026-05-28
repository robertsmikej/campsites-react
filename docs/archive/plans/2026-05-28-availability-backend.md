# Availability Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all per-month rec.gov availability fetches from the browser to the Next.js worker, with shared KV caching across users and a per-user snapshot written by the notifier cron.

**Architecture:** A shared TS module under `next/src/lib/recgov/` owns the canonical fetch + match-detection logic, imported by both the Next.js worker route and the notifier (GitHub Actions). KV stores two layers: raw `recgov:{fac}:{month}` entries (5-min TTL, shared) and per-user `snapshot:{email}` entries (10-min TTL, written by notifier). Frontend hook calls a single `/api/availability` endpoint.

**Tech Stack:** TypeScript, Next.js App Router, Cloudflare Workers + KV, Vitest, Resend, GitHub Actions, recreation.gov public availability API.

**Spec:** `docs/archive/specs/2026-05-28-availability-backend-design.md`

---

## File Map

**Created:**
- `next/src/lib/recgov/types.ts` — shared types (`RawMonthResult`, `SiteAvailabilityMap`, `ProcessSettings`).
- `next/src/lib/recgov/fetch-month.ts` — `fetchMonth(facilityId, month)`.
- `next/src/lib/recgov/match-detection.ts` — `processCampgroundResults`, `getAllDatesInRange`, `findConsecutiveAvailableRanges`, `filterNonOverlapping`.
- `next/src/lib/recgov/cache.ts` — `KvReader` / `KvWriter` interfaces + `WorkerKvAdapter` (native binding) + `RestKvAdapter` (REST API for notifier) + key helpers `rawCacheKey` / `snapshotCacheKey`.
- `next/src/lib/recgov/fetch-with-cache.ts` — `fetchMonthWithCache(facilityId, month, kv)`: check raw cache → fetch → write back.
- `next/src/lib/recgov/index.ts` — barrel re-export for ergonomic imports.
- `next/src/lib/recgov/types.test.ts`, `fetch-month.test.ts`, `match-detection.test.ts`, `cache.test.ts`, `fetch-with-cache.test.ts`.
- `next/src/app/api/availability/route.ts` — new endpoint.
- `next/src/app/api/availability/route.test.ts`.

**Modified:**
- `notifier/check.ts` — replace fetch-availability imports with shared module.
- `notifier/package.json` — no changes (relative imports already work).
- `next/src/hooks/use-campgrounds-data.ts` — rewrite as single fetch.
- `next/src/app/api/users/me/campgrounds/route.ts` — invalidate snapshot on PUT.
- `next/src/app/api/users/me/campgrounds/items/route.ts` — invalidate snapshot on item mutations.
- `.github/workflows/check-campsites.yml` — add CF secrets to env.

**Deleted:**
- `notifier/lib/fetch-availability.ts`, `notifier/lib/fetch-availability.mjs` — replaced by shared module.
- `next/src/lib/recreation-gov.ts`, `next/src/lib/recreation-gov.test.ts` — replaced by shared module + thin hook.
- `notifier/lib/email.mjs`, `notifier/check.mjs` — pre-TS-migration dead artifacts.

---

## Phase 1 — Extract Shared Module

The notifier's `lib/fetch-availability.ts` is the cleaner of the two existing implementations (the frontend `lib/recreation-gov.ts` carries localStorage caching and progress callbacks we'll drop). We use the notifier version as the base, move it into `next/src/lib/recgov/`, then have the notifier import from there.

### Task 1.1: Create shared types module

**Files:**
- Create: `next/src/lib/recgov/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// Shared types for rec.gov availability fetching and match detection.
// Used by both the Next.js worker route and the notifier (GitHub Actions).

import type { StayMatch } from "@/types/campground";
export type { StayMatch };

export const IGNORE_CAMPSITE_TYPES = ["GROUP SHELTER NONELECTRIC", "WALK TO", "DAY USE"];

export interface SiteAvailabilityRaw {
    siteId: string;
    siteName: string;
    campsite_type: string;
    dates: string[];
    matches?: StayMatch[];
}

// Keyed by siteId.
export type SiteAvailabilityMap = Record<string, SiteAvailabilityRaw>;

// Partial shape of rec.gov's per-month response — only the fields we read.
export interface RawSiteData {
    site: string;
    campsite_type: string;
    availabilities: Record<string, string>;
}

export interface RawMonthResult {
    campsites?: Record<string, RawSiteData>;
}

export interface ProcessSettings {
    stayLengths?: number[];
    validStartDays?: string[];
}
```

- [ ] **Step 2: Verify file compiles**

Run from `/Users/mikeroberts/Code/campwatch/next`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors related to `lib/recgov/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add next/src/lib/recgov/types.ts
git commit -m "Add shared recgov types module"
```

---

### Task 1.2: Extract fetchMonth into shared module (TDD)

**Files:**
- Create: `next/src/lib/recgov/fetch-month.ts`
- Create: `next/src/lib/recgov/fetch-month.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/fetch-month.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMonth, REC_GOV_MONTH_URL } from "./fetch-month";

describe("fetchMonth", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("builds the correct rec.gov URL with the encoded month", async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ campsites: {} }), { status: 200 }));
        await fetchMonth("232358", "2026-07");
        const calledWith = fetchSpy.mock.calls[0]?.[0] as string;
        expect(calledWith).toContain("/api/camps/availability/campground/232358/month");
        expect(calledWith).toContain("start_date=2026-07-01T00%3A00%3A00.000Z");
    });

    it("returns parsed JSON on 200", async () => {
        const body = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toEqual(body);
    });

    it("returns null on non-2xx", async () => {
        fetchSpy.mockResolvedValue(new Response("server error", { status: 500 }));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
        fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
        const result = await fetchMonth("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("exports the URL template constant", () => {
        expect(REC_GOV_MONTH_URL).toContain("recreation.gov");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `/Users/mikeroberts/Code/campwatch/next`:
```bash
pnpm exec vitest run src/lib/recgov/fetch-month.test.ts
```
Expected: FAIL with "Cannot find module './fetch-month'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/fetch-month.ts`:
```typescript
import type { RawMonthResult } from "./types";

export const REC_GOV_MONTH_URL = "https://www.recreation.gov/api/camps/availability/campground";

// Fetch a single month of availability data for a campground.
// Returns null on HTTP error or network failure.
export async function fetchMonth(facilityId: string, month: string): Promise<RawMonthResult | null> {
    const url = `${REC_GOV_MONTH_URL}/${facilityId}/month?start_date=${month}-01T00%3A00%3A00.000Z`;
    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            console.error(`[recgov] ${facilityId} ${month}: HTTP ${response.status}`);
            return null;
        }
        return (await response.json()) as RawMonthResult;
    } catch (error) {
        console.error(`[recgov] ${facilityId} ${month}: ${(error as Error).message}`);
        return null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/fetch-month.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/recgov/fetch-month.ts next/src/lib/recgov/fetch-month.test.ts
git commit -m "Extract fetchMonth into shared recgov module"
```

---

### Task 1.3: Extract match-detection into shared module (TDD)

**Files:**
- Create: `next/src/lib/recgov/match-detection.ts`
- Create: `next/src/lib/recgov/match-detection.test.ts`

The logic is a verbatim copy from `notifier/lib/fetch-availability.ts` (lines 39–187), retyped against the shared types. Test it as one module so behavior is locked in before the notifier switches imports.

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/match-detection.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
    getAllDatesInRange,
    findConsecutiveAvailableRanges,
    processCampgroundResults,
} from "./match-detection";
import type { RawMonthResult } from "./types";

describe("getAllDatesInRange", () => {
    it("returns inclusive date list", () => {
        const result = getAllDatesInRange("2026-07-01", "2026-07-03");
        expect(result).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    });

    it("returns single-element list when start === end", () => {
        const result = getAllDatesInRange("2026-07-01", "2026-07-01");
        expect(result).toEqual(["2026-07-01"]);
    });
});

describe("findConsecutiveAvailableRanges", () => {
    it("finds 2-night range from 3 consecutive dates", () => {
        const result = findConsecutiveAvailableRanges(
            ["2026-07-01", "2026-07-02", "2026-07-03"],
            2,
        );
        expect(result).toEqual([
            ["2026-07-01", "2026-07-03"],
        ]);
    });

    it("skips when dates are not consecutive", () => {
        const result = findConsecutiveAvailableRanges(
            ["2026-07-01", "2026-07-03"],
            2,
        );
        expect(result).toEqual([]);
    });
});

describe("processCampgroundResults", () => {
    it("filters by stay length and start day", () => {
        const apiResult: RawMonthResult = {
            campsites: {
                "site-1": {
                    site: "001",
                    campsite_type: "STANDARD",
                    availabilities: {
                        "2026-07-03T00:00:00Z": "Available", // Friday
                        "2026-07-04T00:00:00Z": "Available", // Saturday
                        "2026-07-05T00:00:00Z": "Available", // Sunday
                    },
                },
            },
        };
        const allDates = ["2026-07-03", "2026-07-04", "2026-07-05"];
        const result = processCampgroundResults([apiResult], allDates, {
            stayLengths: [2],
            validStartDays: ["Friday"],
        });
        expect(result["site-1"]?.matches).toEqual([
            { from: "2026-07-03", to: "2026-07-05", nights: 2 },
        ]);
    });

    it("excludes IGNORE_CAMPSITE_TYPES", () => {
        const apiResult: RawMonthResult = {
            campsites: {
                "site-1": {
                    site: "001",
                    campsite_type: "DAY USE",
                    availabilities: {
                        "2026-07-03T00:00:00Z": "Available",
                        "2026-07-04T00:00:00Z": "Available",
                    },
                },
            },
        };
        const result = processCampgroundResults([apiResult], ["2026-07-03", "2026-07-04"], {
            stayLengths: [1],
            validStartDays: ["Friday"],
        });
        expect(result["site-1"]).toBeUndefined();
    });

    it("returns empty map when no campsites match window", () => {
        const apiResult: RawMonthResult = { campsites: {} };
        const result = processCampgroundResults([apiResult], ["2026-07-03"], {
            stayLengths: [1],
            validStartDays: ["Friday"],
        });
        expect(result).toEqual({});
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/recgov/match-detection.test.ts
```
Expected: FAIL with "Cannot find module './match-detection'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/match-detection.ts`:
```typescript
import {
    IGNORE_CAMPSITE_TYPES,
    type ProcessSettings,
    type RawMonthResult,
    type SiteAvailabilityMap,
    type StayMatch,
} from "./types";

export const getAllDatesInRange = (start: string, end: string): string[] => {
    const result: string[] = [];
    const current = new Date(start);
    const final = new Date(end);
    while (current <= final) {
        result.push(current.toISOString().split("T")[0] ?? "");
        current.setDate(current.getDate() + 1);
    }
    return result;
};

export const findConsecutiveAvailableRanges = (
    dates: string[],
    length: number,
): [string, string][] => {
    const ranges: [string, string][] = [];
    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let i = 0; i <= timestamps.length - length; ) {
        const iTs = timestamps[i] ?? 0;
        let isConsecutive = true;
        for (let j = 1; j < length; j++) {
            const expected = iTs + j * 86400000;
            if ((timestamps[i + j] ?? -1) !== expected) {
                isConsecutive = false;
                break;
            }
        }
        if (isConsecutive) {
            const from = new Date(iTs).toISOString().split("T")[0] ?? "";
            const lastTs = timestamps[i + length - 1] ?? iTs;
            const toDate = new Date(lastTs);
            toDate.setDate(toDate.getDate() + 1);
            const to = toDate.toISOString().split("T")[0] ?? "";
            ranges.push([from, to]);
            i += length;
        } else {
            i++;
        }
    }
    return ranges;
};

const filterNonOverlapping = (matches: StayMatch[]): StayMatch[] => {
    const sorted = [...matches].sort((a, b) => b.nights - a.nights);
    const filtered: StayMatch[] = [];
    for (const match of sorted) {
        const matchStart = new Date(match.from);
        const matchEnd = new Date(match.to);
        const isContained = filtered.some(({ from, to }) => {
            const existingStart = new Date(from);
            const existingEnd = new Date(to);
            return matchStart >= existingStart && matchEnd <= existingEnd;
        });
        if (!isContained) filtered.push(match);
    }
    return filtered;
};

export const processCampgroundResults = (
    apiResults: (RawMonthResult | null)[],
    allDates: string[],
    settings: ProcessSettings,
): SiteAvailabilityMap => {
    const siteAvailability: SiteAvailabilityMap = {};
    const minStay = Math.min(...(settings.stayLengths ?? [2]));
    const maxStay = Math.max(...(settings.stayLengths ?? [5]));

    for (const data of apiResults) {
        if (!data?.campsites) continue;
        for (const [siteId, siteData] of Object.entries(data.campsites)) {
            if (IGNORE_CAMPSITE_TYPES.includes(siteData.campsite_type)) continue;
            if (!siteAvailability[siteId]) {
                siteAvailability[siteId] = {
                    siteId,
                    siteName: siteData.site,
                    campsite_type: siteData.campsite_type,
                    dates: [],
                };
            }
            const validDates = Object.entries(siteData.availabilities)
                .filter(([, status]) => status === "Available")
                .map(([date]) => date.split("T")[0] ?? "")
                .filter((date) => allDates.includes(date));
            siteAvailability[siteId]?.dates.push(...validDates);
        }
    }

    for (const siteId in siteAvailability) {
        const site = siteAvailability[siteId];
        if (!site) continue;
        const uniqueDates = [...new Set(site.dates)].sort();
        const stayMatches: StayMatch[] = [];
        for (let length = 1; length <= 14; length++) {
            const allRangesForLength = findConsecutiveAvailableRanges(uniqueDates, length);
            for (const [from, to] of allRangesForLength) {
                const parts = from.split("-").map(Number);
                const y = parts[0] ?? 0;
                const m = parts[1] ?? 1;
                const d = parts[2] ?? 1;
                const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
                    weekday: "long",
                    timeZone: "UTC",
                });
                const isValidStartDay =
                    !settings.validStartDays?.length || settings.validStartDays.includes(startDay);
                const isValidStayLength = length >= minStay && length <= maxStay;
                if (isValidStayLength && isValidStartDay) {
                    stayMatches.push({ from, to, nights: length });
                }
            }
        }
        site.matches = filterNonOverlapping(stayMatches);
        delete (site as Partial<typeof site>).dates;
    }

    return siteAvailability;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/match-detection.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/recgov/match-detection.ts next/src/lib/recgov/match-detection.test.ts
git commit -m "Extract rec.gov match-detection into shared module"
```

---

### Task 1.4: Add barrel re-export

**Files:**
- Create: `next/src/lib/recgov/index.ts`

- [ ] **Step 1: Write the file**

```typescript
export * from "./types";
export * from "./fetch-month";
export * from "./match-detection";
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add next/src/lib/recgov/index.ts
git commit -m "Add recgov barrel re-export"
```

---

### Task 1.5: Switch notifier to import from shared module

**Files:**
- Modify: `notifier/check.ts:6`

- [ ] **Step 1: Replace the import**

Change line 6 of `notifier/check.ts` from:
```typescript
import { fetchMonth, processCampgroundResults, getAllDatesInRange } from "./lib/fetch-availability";
```
to:
```typescript
import {
    fetchMonth,
    processCampgroundResults,
    getAllDatesInRange,
} from "../next/src/lib/recgov";
```

Also change line 13:
```typescript
import type { SiteAvailabilityMap } from "./lib/fetch-availability";
```
to:
```typescript
import type { SiteAvailabilityMap } from "../next/src/lib/recgov";
```

- [ ] **Step 2: Verify notifier typecheck**

Run from `/Users/mikeroberts/Code/campwatch/notifier`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Smoke-run the notifier against real users (dry mode)**

Run from `/Users/mikeroberts/Code/campwatch/notifier` with secrets from a fresh `.env` or `gh secret list` reference:
```bash
SUBSCRIBER_API_URL="<...>" SUBSCRIBER_API_SECRET="<...>" RESEND_API_KEY="dryrun" SITE_URL="https://campwatch.dev" npx tsx check.ts 2>&1 | head -40
```
Expected: notifier runs through fetching + match detection. The Resend call at the end will fail (intentional — `dryrun` key). Verify no errors before the email-send step.

- [ ] **Step 4: Commit**

```bash
git add notifier/check.ts
git commit -m "Notifier: import recgov logic from shared module"
```

---

### Task 1.6: Delete duplicated notifier file

**Files:**
- Delete: `notifier/lib/fetch-availability.ts`, `notifier/lib/fetch-availability.mjs`

- [ ] **Step 1: Verify nothing else imports the old file**

```bash
grep -rn "fetch-availability" /Users/mikeroberts/Code/campwatch --include="*.ts" --include="*.mjs" --include="*.json" | grep -v node_modules
```
Expected: zero matches (the import in `check.ts` was already swapped in 1.5).

- [ ] **Step 2: Delete the files**

```bash
rm notifier/lib/fetch-availability.ts notifier/lib/fetch-availability.mjs
```

- [ ] **Step 3: Verify notifier still typechecks**

Run from `/Users/mikeroberts/Code/campwatch/notifier`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A notifier/lib/
git commit -m "Remove duplicated notifier fetch-availability module"
```

---

## Phase 2 — Raw `(facility, month)` KV Cache

Adds shared raw-data caching. The shared module exposes a `KvAdapter` interface plus two backends (native CF binding for the worker, REST API for the notifier). After this phase the notifier writes raw cache entries on every fetch; the worker route in Phase 3 reads them.

### Task 2.1: Define KvAdapter interface and key helpers (TDD)

**Files:**
- Create: `next/src/lib/recgov/cache.ts`
- Create: `next/src/lib/recgov/cache.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/cache.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { rawCacheKey, snapshotCacheKey, RAW_CACHE_TTL_SECONDS, SNAPSHOT_CACHE_TTL_SECONDS } from "./cache";

describe("cache key helpers", () => {
    it("rawCacheKey builds recgov:{fac}:{month}", () => {
        expect(rawCacheKey("232358", "2026-07")).toBe("recgov:232358:2026-07");
    });

    it("snapshotCacheKey builds snapshot:{email}", () => {
        expect(snapshotCacheKey("alice@example.com")).toBe("snapshot:alice@example.com");
    });

    it("raw cache TTL is 5 minutes", () => {
        expect(RAW_CACHE_TTL_SECONDS).toBe(300);
    });

    it("snapshot cache TTL is 10 minutes", () => {
        expect(SNAPSHOT_CACHE_TTL_SECONDS).toBe(600);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/recgov/cache.test.ts
```
Expected: FAIL with "Cannot find module './cache'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/cache.ts`:
```typescript
import type { RawMonthResult, SiteAvailabilityMap } from "./types";

export const RAW_CACHE_TTL_SECONDS = 5 * 60;
export const SNAPSHOT_CACHE_TTL_SECONDS = 10 * 60;

export const rawCacheKey = (facilityId: string, month: string): string =>
    `recgov:${facilityId}:${month}`;

export const snapshotCacheKey = (email: string): string => `snapshot:${email}`;

// Snapshot value shape — the data the dashboard ultimately consumes.
// One entry per campground the user watches; site availability already filtered.
export interface SnapshotCampground {
    campgroundId: string;
    campgroundName: string;
    campgroundArea: string;
    campgroundDescription: string;
    sites: SiteAvailabilityMap;
}

export interface AvailabilitySnapshot {
    updatedAt: string;
    campgrounds: SnapshotCampground[];
}

// Common interface used by both the Next.js worker and the notifier.
// Worker: backed by native CF KV binding. Notifier: backed by CF KV REST API.
export interface KvAdapter {
    getRaw(facilityId: string, month: string): Promise<RawMonthResult | null>;
    putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void>;
    getSnapshot(email: string): Promise<AvailabilitySnapshot | null>;
    putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void>;
    deleteSnapshot(email: string): Promise<void>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/cache.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/recgov/cache.ts next/src/lib/recgov/cache.test.ts
git commit -m "Add recgov cache key helpers + KvAdapter interface"
```

---

### Task 2.2: Implement WorkerKvAdapter (native CF binding) (TDD)

**Files:**
- Create: `next/src/lib/recgov/worker-kv.ts`
- Create: `next/src/lib/recgov/worker-kv.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/worker-kv.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { WorkerKvAdapter } from "./worker-kv";
import type { RawMonthResult } from "./types";

function createMockKv() {
    const store = new Map<string, string>();
    return {
        get: vi.fn(async (key: string, type?: string) => {
            const value = store.get(key);
            if (value === undefined) return null;
            return type === "json" ? JSON.parse(value) : value;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        _store: store,
    };
}

describe("WorkerKvAdapter", () => {
    it("putRaw + getRaw round-trips", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const value: RawMonthResult = { campsites: {} };
        await adapter.putRaw("232358", "2026-07", value);
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toEqual(value);
    });

    it("getRaw returns null on miss", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const result = await adapter.getRaw("nope", "2026-07");
        expect(result).toBeNull();
    });

    it("putRaw sets the 5-minute TTL", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        expect(kv.put).toHaveBeenCalledWith(
            "recgov:232358:2026-07",
            expect.any(String),
            expect.objectContaining({ expirationTtl: 300 }),
        );
    });

    it("deleteSnapshot calls KV delete with the right key", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.deleteSnapshot("alice@example.com");
        expect(kv.delete).toHaveBeenCalledWith("snapshot:alice@example.com");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/recgov/worker-kv.test.ts
```
Expected: FAIL with "Cannot find module './worker-kv'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/worker-kv.ts`:
```typescript
import type { KVNamespace } from "@cloudflare/workers-types";
import {
    rawCacheKey,
    snapshotCacheKey,
    RAW_CACHE_TTL_SECONDS,
    SNAPSHOT_CACHE_TTL_SECONDS,
    type AvailabilitySnapshot,
    type KvAdapter,
} from "./cache";
import type { RawMonthResult } from "./types";

export class WorkerKvAdapter implements KvAdapter {
    constructor(private readonly kv: KVNamespace) {}

    async getRaw(facilityId: string, month: string): Promise<RawMonthResult | null> {
        return (await this.kv.get(rawCacheKey(facilityId, month), "json")) as RawMonthResult | null;
    }

    async putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void> {
        await this.kv.put(rawCacheKey(facilityId, month), JSON.stringify(value), {
            expirationTtl: RAW_CACHE_TTL_SECONDS,
        });
    }

    async getSnapshot(email: string): Promise<AvailabilitySnapshot | null> {
        return (await this.kv.get(snapshotCacheKey(email), "json")) as AvailabilitySnapshot | null;
    }

    async putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void> {
        await this.kv.put(snapshotCacheKey(email), JSON.stringify(value), {
            expirationTtl: SNAPSHOT_CACHE_TTL_SECONDS,
        });
    }

    async deleteSnapshot(email: string): Promise<void> {
        await this.kv.delete(snapshotCacheKey(email));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/worker-kv.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/recgov/worker-kv.ts next/src/lib/recgov/worker-kv.test.ts
git commit -m "Add WorkerKvAdapter for native CF KV binding"
```

---

### Task 2.3: Implement RestKvAdapter (TDD)

**Files:**
- Create: `next/src/lib/recgov/rest-kv.ts`
- Create: `next/src/lib/recgov/rest-kv.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/rest-kv.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RestKvAdapter } from "./rest-kv";

describe("RestKvAdapter", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const adapter = new RestKvAdapter({
        accountId: "acc-123",
        namespaceId: "ns-456",
        apiToken: "tok-xyz",
    });

    it("putRaw POSTs to the right endpoint with TTL", async () => {
        fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        const [url, init] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toContain(
            "/accounts/acc-123/storage/kv/namespaces/ns-456/values/recgov%3A232358%3A2026-07",
        );
        expect(url).toContain("expiration_ttl=300");
        expect((init as RequestInit).method).toBe("PUT");
        expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
            "Bearer tok-xyz",
        );
    });

    it("getRaw returns null on 404", async () => {
        fetchSpy.mockResolvedValue(new Response("not found", { status: 404 }));
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("getRaw returns parsed JSON on 200", async () => {
        const body = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toEqual(body);
    });

    it("putSnapshot uses 600s TTL and snapshot:{email} key", async () => {
        fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));
        await adapter.putSnapshot("alice@example.com", { updatedAt: "now", campgrounds: [] });
        const [url] = fetchSpy.mock.calls[0] ?? [];
        expect(url).toContain("snapshot%3Aalice%40example.com");
        expect(url).toContain("expiration_ttl=600");
    });

    it("throws on non-2xx PUT response", async () => {
        fetchSpy.mockResolvedValue(new Response("forbidden", { status: 403 }));
        await expect(
            adapter.putRaw("232358", "2026-07", { campsites: {} }),
        ).rejects.toThrow(/403/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/recgov/rest-kv.test.ts
```
Expected: FAIL with "Cannot find module './rest-kv'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/rest-kv.ts`:
```typescript
import {
    rawCacheKey,
    snapshotCacheKey,
    RAW_CACHE_TTL_SECONDS,
    SNAPSHOT_CACHE_TTL_SECONDS,
    type AvailabilitySnapshot,
    type KvAdapter,
} from "./cache";
import type { RawMonthResult } from "./types";

export interface RestKvOptions {
    accountId: string;
    namespaceId: string;
    apiToken: string;
}

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export class RestKvAdapter implements KvAdapter {
    constructor(private readonly opts: RestKvOptions) {}

    private endpoint(key: string): string {
        return `${CF_API_BASE}/accounts/${this.opts.accountId}/storage/kv/namespaces/${this.opts.namespaceId}/values/${encodeURIComponent(key)}`;
    }

    private async getJson<T>(key: string): Promise<T | null> {
        const response = await fetch(this.endpoint(key), {
            method: "GET",
            headers: { Authorization: `Bearer ${this.opts.apiToken}` },
        });
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`KV REST GET ${key} failed: ${response.status}`);
        }
        return (await response.json()) as T;
    }

    private async put(key: string, value: unknown, ttlSeconds: number): Promise<void> {
        const url = `${this.endpoint(key)}?expiration_ttl=${ttlSeconds}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${this.opts.apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(value),
        });
        if (!response.ok) {
            throw new Error(`KV REST PUT ${key} failed: ${response.status}`);
        }
    }

    async getRaw(facilityId: string, month: string): Promise<RawMonthResult | null> {
        return this.getJson<RawMonthResult>(rawCacheKey(facilityId, month));
    }

    async putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void> {
        await this.put(rawCacheKey(facilityId, month), value, RAW_CACHE_TTL_SECONDS);
    }

    async getSnapshot(email: string): Promise<AvailabilitySnapshot | null> {
        return this.getJson<AvailabilitySnapshot>(snapshotCacheKey(email));
    }

    async putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void> {
        await this.put(snapshotCacheKey(email), value, SNAPSHOT_CACHE_TTL_SECONDS);
    }

    async deleteSnapshot(email: string): Promise<void> {
        const response = await fetch(this.endpoint(snapshotCacheKey(email)), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${this.opts.apiToken}` },
        });
        if (response.status !== 200 && response.status !== 404) {
            throw new Error(`KV REST DELETE snapshot:${email} failed: ${response.status}`);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/rest-kv.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/recgov/rest-kv.ts next/src/lib/recgov/rest-kv.test.ts
git commit -m "Add RestKvAdapter for CF KV REST API (used by notifier)"
```

---

### Task 2.4: Add fetchMonthWithCache wrapper (TDD)

**Files:**
- Create: `next/src/lib/recgov/fetch-with-cache.ts`
- Create: `next/src/lib/recgov/fetch-with-cache.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/lib/recgov/fetch-with-cache.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMonthWithCache } from "./fetch-with-cache";
import type { KvAdapter, AvailabilitySnapshot } from "./cache";
import type { RawMonthResult } from "./types";

function createMockAdapter(initial: Record<string, RawMonthResult> = {}): KvAdapter & {
    raw: Record<string, RawMonthResult>;
} {
    const raw: Record<string, RawMonthResult> = { ...initial };
    return {
        raw,
        async getRaw(facilityId, month) {
            return raw[`${facilityId}:${month}`] ?? null;
        },
        async putRaw(facilityId, month, value) {
            raw[`${facilityId}:${month}`] = value;
        },
        async getSnapshot(): Promise<AvailabilitySnapshot | null> {
            return null;
        },
        async putSnapshot(): Promise<void> {},
        async deleteSnapshot(): Promise<void> {},
    };
}

describe("fetchMonthWithCache", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("returns cached value without calling rec.gov on hit", async () => {
        const cached: RawMonthResult = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        const adapter = createMockAdapter({ "232358:2026-07": cached });
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toEqual(cached);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fetches rec.gov and writes through to cache on miss", async () => {
        const fresh: RawMonthResult = { campsites: {} };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(fresh), { status: 200 }));
        const adapter = createMockAdapter();
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toEqual(fresh);
        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(adapter.raw["232358:2026-07"]).toEqual(fresh);
    });

    it("returns null and does not cache when rec.gov fails", async () => {
        fetchSpy.mockResolvedValue(new Response("error", { status: 500 }));
        const adapter = createMockAdapter();
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toBeNull();
        expect(adapter.raw["232358:2026-07"]).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/lib/recgov/fetch-with-cache.test.ts
```
Expected: FAIL with "Cannot find module './fetch-with-cache'".

- [ ] **Step 3: Write the implementation**

`next/src/lib/recgov/fetch-with-cache.ts`:
```typescript
import { fetchMonth } from "./fetch-month";
import type { KvAdapter } from "./cache";
import type { RawMonthResult } from "./types";

// Reads from cache; on miss, fetches rec.gov and writes through.
// Returns null if both cache and rec.gov fail to produce a value.
export async function fetchMonthWithCache(
    facilityId: string,
    month: string,
    kv: KvAdapter,
): Promise<RawMonthResult | null> {
    const cached = await kv.getRaw(facilityId, month);
    if (cached) return cached;

    const fresh = await fetchMonth(facilityId, month);
    if (fresh) {
        await kv.putRaw(facilityId, month, fresh);
    }
    return fresh;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm exec vitest run src/lib/recgov/fetch-with-cache.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Update barrel re-export**

Modify `next/src/lib/recgov/index.ts`:
```typescript
export * from "./types";
export * from "./fetch-month";
export * from "./match-detection";
export * from "./cache";
export * from "./worker-kv";
export * from "./rest-kv";
export * from "./fetch-with-cache";
```

- [ ] **Step 6: Verify typecheck**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add next/src/lib/recgov/fetch-with-cache.ts next/src/lib/recgov/fetch-with-cache.test.ts next/src/lib/recgov/index.ts
git commit -m "Add fetchMonthWithCache wrapper + update barrel"
```

---

### Task 2.5: Add CF secrets to GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/check-campsites.yml:27-35`

**Note:** This task requires the actual CF API token to be created and stored in GH secrets. The token creation is a one-time manual step; the workflow change just references the secrets by name. Token values never appear in committed files.

- [ ] **Step 1: Create the CF API token (manual)**

In a browser:
1. Go to <https://dash.cloudflare.com/profile/api-tokens>.
2. Create Token → Use the "Edit Cloudflare Workers" template, OR "Create Custom Token" with these permissions:
   - **Account → Workers KV Storage: Edit**
3. Account Resources: include the campwatch account only.
4. Zone Resources: not needed.
5. Copy the generated token.

- [ ] **Step 2: Add the secrets to the GH repo**

```bash
gh secret set CLOUDFLARE_API_TOKEN -R robertsmikej/campsites-react
# paste token when prompted
gh secret set CLOUDFLARE_ACCOUNT_ID -R robertsmikej/campsites-react
# paste account ID
gh secret set CLOUDFLARE_KV_NAMESPACE_ID -R robertsmikej/campsites-react
# paste 41a67a8b06044ee38f0bf22cfbcc069d (from next/wrangler.jsonc)
```

Verify with:
```bash
gh secret list -R robertsmikej/campsites-react | grep -E "CLOUDFLARE_"
```
Expected: three lines, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_KV_NAMESPACE_ID`.

- [ ] **Step 3: Wire secrets into the workflow**

Modify `.github/workflows/check-campsites.yml` lines 27-35. Change:
```yaml
      - name: Check availability and notify
        working-directory: notifier
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          SUBSCRIBER_API_URL: ${{ secrets.SUBSCRIBER_API_URL }}
          SUBSCRIBER_API_SECRET: ${{ secrets.SUBSCRIBER_API_SECRET }}
          SITE_URL: ${{ secrets.SITE_URL }}
          FORCE_EMAIL: ${{ github.event.inputs.force_email }}
        run: npx tsx check.ts
```
to:
```yaml
      - name: Check availability and notify
        working-directory: notifier
        env:
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          SUBSCRIBER_API_URL: ${{ secrets.SUBSCRIBER_API_URL }}
          SUBSCRIBER_API_SECRET: ${{ secrets.SUBSCRIBER_API_SECRET }}
          SITE_URL: ${{ secrets.SITE_URL }}
          FORCE_EMAIL: ${{ github.event.inputs.force_email }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_KV_NAMESPACE_ID: ${{ secrets.CLOUDFLARE_KV_NAMESPACE_ID }}
        run: npx tsx check.ts
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/check-campsites.yml
git commit -m "Wire CF KV secrets into notifier workflow"
```

---

### Task 2.6: Plumb raw cache into notifier fetchDeduped

**Files:**
- Modify: `notifier/check.ts:151-175` (the `fetchDeduped` function and its caller)

- [ ] **Step 1: Add adapter construction near the top of check.ts**

Add to `notifier/check.ts` after the existing imports (around line 14):
```typescript
import { RestKvAdapter, fetchMonthWithCache } from "../next/src/lib/recgov";

function buildKvAdapter(): RestKvAdapter | null {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !namespaceId || !apiToken) {
        console.warn("[KV] Cloudflare creds not configured — running without KV cache");
        return null;
    }
    return new RestKvAdapter({ accountId, namespaceId, apiToken });
}

const kvAdapter = buildKvAdapter();
```

- [ ] **Step 2: Update fetchDeduped to use fetchMonthWithCache**

Replace the body of `fetchDeduped` (lines 151–175 of the current file) with a version that uses the adapter when available:
```typescript
async function fetchDeduped(plan: FetchPlanItem[]): Promise<Record<string, unknown[]>> {
    const byCampground = new Map<string, string[]>();
    for (const { campgroundId, month } of plan) {
        if (!byCampground.has(campgroundId)) byCampground.set(campgroundId, []);
        byCampground.get(campgroundId)!.push(month);
    }
    for (const [id, months] of byCampground) {
        console.log(`[Fetch] Campground ${id}: ${months.length} month(s) to fetch`);
    }

    const rawByCampground: Record<string, unknown[]> = {};
    for (let i = 0; i < plan.length; i++) {
        const planEntry = plan[i];
        if (!planEntry) continue;
        const { campgroundId, month } = planEntry;
        const result = kvAdapter
            ? await fetchMonthWithCache(campgroundId, month, kvAdapter)
            : await fetchMonth(campgroundId, month);
        if (!rawByCampground[campgroundId]) rawByCampground[campgroundId] = [];
        rawByCampground[campgroundId].push(result);
        if (i < plan.length - 1) {
            await delay(DELAY_BETWEEN_FETCHES_MS);
        }
    }
    return rawByCampground;
}
```

- [ ] **Step 3: Verify notifier typechecks**

Run from `/Users/mikeroberts/Code/campwatch/notifier`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke run notifier locally without CF creds**

Run from `/Users/mikeroberts/Code/campwatch/notifier`:
```bash
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_KV_NAMESPACE_ID
SUBSCRIBER_API_URL="<test url or skip>" SUBSCRIBER_API_SECRET="<...>" RESEND_API_KEY="dryrun" SITE_URL="https://campwatch.dev" npx tsx check.ts 2>&1 | head -10
```
Expected: log line `[KV] Cloudflare creds not configured — running without KV cache`. Falls back to uncached fetchMonth.

- [ ] **Step 5: Commit**

```bash
git add notifier/check.ts
git commit -m "Notifier: route per-month fetches through KV cache when configured"
```

- [ ] **Step 6: Watch the next scheduled cron run**

After push (Phase 6 will do this in the integration commit; for now, run locally only). Verify in GH Actions logs that the cron succeeds with the new env vars present.

---

## Phase 3 — Backend `/api/availability` Route

Adds the user-facing endpoint. Reads snapshot for logged-in users, falls back to live fetch (which uses the raw cache from Phase 2). Anonymous requests always go through live fetch using the curated default config.

### Task 3.1: Write route tests (TDD)

**Files:**
- Create: `next/src/app/api/availability/route.test.ts`

- [ ] **Step 1: Write the failing test**

`next/src/app/api/availability/route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";
import * as userCampgrounds from "@/lib/user-campgrounds";

vi.mock("@/lib/sessions");
vi.mock("@/lib/cloudflare");
vi.mock("@/lib/user-campgrounds");

function createMockKv() {
    const store = new Map<string, string>();
    return {
        get: vi.fn(async (key: string, type?: string) => {
            const v = store.get(key);
            if (v === undefined) return null;
            return type === "json" ? JSON.parse(v) : v;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        _store: store,
    };
}

describe("GET /api/availability", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let kv: ReturnType<typeof createMockKv>;

    beforeEach(() => {
        vi.clearAllMocks();
        fetchSpy = vi.spyOn(globalThis, "fetch");
        kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv as never);
    });

    it("returns snapshot from KV when present for logged-in user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        const snapshot = { updatedAt: "2026-05-28T00:00:00Z", campgrounds: [] };
        kv._store.set("snapshot:alice@example.com", JSON.stringify(snapshot));

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(snapshot);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("falls back to live fetch when no snapshot exists (logged-in)", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Test CG",
                        enabled: true,
                        dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: "2026-05-01T00:00:00Z",
        } as never);
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({ campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.campgrounds).toHaveLength(1);
        expect(fetchSpy).toHaveBeenCalled();
    });

    it("anonymous request uses curated default config", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        kv._store.set(
            "config:campgrounds",
            JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        {
                            id: "232358",
                            name: "Default CG",
                            enabled: true,
                            dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                            sites: { favorites: [], worthwhile: [] },
                        },
                    ],
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
        );
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({ campsites: {} }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.campgrounds)).toBe(true);
    });

    it("writes snapshot after live fetch (logged-in only)", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: { "recreation.gov": [] },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: null,
        } as never);

        await GET(new Request("http://x/api/availability"));
        expect(kv.put).toHaveBeenCalledWith(
            "snapshot:alice@example.com",
            expect.any(String),
            expect.objectContaining({ expirationTtl: 600 }),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run src/app/api/availability/route.test.ts
```
Expected: FAIL with "Cannot find module './route'".

---

### Task 3.2: Implement the route

**Files:**
- Create: `next/src/app/api/availability/route.ts`

- [ ] **Step 1: Write the implementation**

`next/src/app/api/availability/route.ts`:
```typescript
import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import {
    WorkerKvAdapter,
    fetchMonthWithCache,
    processCampgroundResults,
    getAllDatesInRange,
    type AvailabilitySnapshot,
    type SnapshotCampground,
} from "@/lib/recgov";
import type { Campground, GlobalSettings } from "@/types/campground";

const DEFAULT_CONFIG_KEY = "config:campgrounds";

interface SourceConfig {
    campgrounds: { "recreation.gov"?: Campground[] };
    globalSettings: GlobalSettings;
}

function monthsBetween(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, "0");
        months.push(`${y}-${m}`);
        current.setMonth(current.getMonth() + 1);
    }
    return months;
}

async function buildSnapshot(
    config: SourceConfig,
    adapter: WorkerKvAdapter,
): Promise<AvailabilitySnapshot> {
    const baseSettings = {
        stayLengths: config.globalSettings.stayLengths,
        validStartDays: config.globalSettings.validStartDays,
    };
    const campgrounds = config.campgrounds["recreation.gov"] ?? [];
    const results: SnapshotCampground[] = [];

    for (const cg of campgrounds) {
        if (cg.enabled === false) continue;
        const start = cg.dates?.startDate;
        const end = cg.dates?.endDate;
        if (!start || !end) continue;

        const months = monthsBetween(start, end);
        const rawResults = await Promise.all(
            months.map((month) => fetchMonthWithCache(cg.id, month, adapter)),
        );

        const allDates = getAllDatesInRange(start, end);
        const effectiveSettings = {
            ...baseSettings,
            ...(cg.stayLengths ? { stayLengths: cg.stayLengths } : {}),
            ...(cg.validStartDays ? { validStartDays: cg.validStartDays } : {}),
        };

        const sites = processCampgroundResults(rawResults, allDates, effectiveSettings);
        results.push({
            campgroundId: cg.id,
            campgroundName: cg.name,
            campgroundArea: cg.area ?? "",
            campgroundDescription: cg.description ?? "",
            sites,
        });
    }

    return { updatedAt: new Date().toISOString(), campgrounds: results };
}

async function getHandler(request: Request): Promise<Response> {
    const kv = getKv();
    const adapter = new WorkerKvAdapter(kv);
    const session = await readSession(request);

    if (session) {
        const cached = await adapter.getSnapshot(session.email);
        if (cached) return withCors(jsonResponse(cached));

        const userRecord = await getUserCampgrounds(session.email);
        const config: SourceConfig = {
            campgrounds: userRecord?.campgrounds ?? { "recreation.gov": [] },
            globalSettings: (userRecord?.globalSettings ?? {
                stayLengths: [2, 3, 4, 5],
                validStartDays: ["Friday", "Saturday"],
            }) as GlobalSettings,
        };
        const snapshot = await buildSnapshot(config, adapter);
        await adapter.putSnapshot(session.email, snapshot);
        return withCors(jsonResponse(snapshot));
    }

    // Anonymous: use curated default config; no snapshot persistence.
    const defaultConfig = (await kv.get(DEFAULT_CONFIG_KEY, "json")) as SourceConfig | null;
    if (!defaultConfig) {
        return withCors(jsonResponse({ updatedAt: new Date().toISOString(), campgrounds: [] }));
    }
    const snapshot = await buildSnapshot(defaultConfig, adapter);
    return withCors(jsonResponse(snapshot));
}

export const GET = withErrorLogging(getHandler, "GET /api/availability");
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pnpm exec vitest run src/app/api/availability/route.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 3: Run all related tests to confirm nothing else broke**

```bash
pnpm exec vitest run src/lib/recgov src/app/api/availability
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add next/src/app/api/availability/route.ts next/src/app/api/availability/route.test.ts
git commit -m "Add GET /api/availability route with KV-cached fallback"
```

---

## Phase 4 — Frontend Hook Rewrite

Browser now hits `/api/availability` instead of recreation.gov directly. Network tab is clean.

### Task 4.1: Rewrite useCampgroundsData

**Files:**
- Modify: `next/src/hooks/use-campgrounds-data.ts` (full rewrite)

- [ ] **Step 1: Write the new implementation**

Overwrite `next/src/hooks/use-campgrounds-data.ts`:
```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGroupsByFavorites } from "@/lib/campground-utils";
import type { AvailabilitySnapshot } from "@/lib/recgov";
import type { CampgroundsBySystem, ProcessedCampground } from "@/types/campground";

interface UseCampgroundsDataArgs {
    enabled: boolean;
}

interface ProgressBarData {
    totalCalls: number;
    currentCall: number;
    progress: number;
}

export function useCampgroundsData({ enabled }: UseCampgroundsDataArgs) {
    const [campgroundsData, setCampgroundsData] = useState<CampgroundsBySystem>({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState<ProcessedCampground[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    // Kept for component-API compatibility; progress is now binary (loading vs done).
    const progressBarData: ProgressBarData = {
        totalCalls: 1,
        currentCall: isFetching ? 0 : 1,
        progress: isFetching ? 0 : 1,
    };

    const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        async function run() {
            setIsFetching(true);
            try {
                const response = await fetch("/api/availability");
                if (!response.ok) {
                    console.error(`[availability] HTTP ${response.status}`);
                    if (!cancelled) setCampgroundsData({});
                    return;
                }
                const snapshot = (await response.json()) as AvailabilitySnapshot;
                if (cancelled) return;

                // Reshape snapshot.campgrounds[] back into the system-keyed map the dashboard expects.
                const bySystem: CampgroundsBySystem = { "recreation.gov": [] };
                for (const cg of snapshot.campgrounds) {
                    bySystem["recreation.gov"]?.push({
                        campgroundId: cg.campgroundId,
                        campgroundName: cg.campgroundName,
                        campgroundArea: cg.campgroundArea,
                        campgroundDescription: cg.campgroundDescription,
                        sites: cg.sites,
                    } as unknown as ProcessedCampground);
                }
                setCampgroundsData(bySystem);
            } catch (e) {
                console.error("[availability] fetch error:", e);
                if (!cancelled) setCampgroundsData({});
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [enabled, reloadKey]);

    useEffect(() => {
        if (Object.keys(campgroundsData).length === 0) {
            setCampgroundsByAreas([]);
            return;
        }
        setCampgroundsByAreas(
            formatGroupsByFavorites(campgroundsData as Record<string, ProcessedCampground[]>) ?? [],
        );
    }, [campgroundsData]);

    return { campgroundsData, campgroundsByAreas, isFetching, progressBarData, refresh };
}
```

- [ ] **Step 2: Update callers to drop unused args**

The hook used to take `siteConfig`, `settings`, `useMockData`, `enabled`. Now only `enabled`. Update:

`next/src/app/app/page.tsx` line 81:
```typescript
    const { campgroundsByAreas, isFetching, progressBarData } = useCampgroundsData({
        enabled: !isHydrating,
    });
```

`next/src/app/discover/discover-client.tsx` line 64:
```typescript
    const { campgroundsByAreas, isFetching, progressBarData } = useCampgroundsData({
        enabled: true,
    });
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm exec tsc --noEmit
```
Expected: no errors. If `useMockData`-related code in those pages is now unused, leave it for follow-up — out of scope for this plan.

- [ ] **Step 4: Run dev server and verify in browser**

```bash
pnpm dev
```
Open <http://localhost:3000/app> (signed in) and <http://localhost:3000/discover> (anonymous OK). In DevTools Network tab:
- Expected: ONE call to `/api/availability` per page load.
- Expected: ZERO calls to `recreation.gov`.

- [ ] **Step 5: Commit**

```bash
git add next/src/hooks/use-campgrounds-data.ts next/src/app/app/page.tsx next/src/app/discover/discover-client.tsx
git commit -m "Frontend: fetch availability from /api/availability instead of rec.gov"
```

---

### Task 4.2: Delete dead client lib

**Files:**
- Delete: `next/src/lib/recreation-gov.ts`, `next/src/lib/recreation-gov.test.ts`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -rn "from \"@/lib/recreation-gov\"\|from \"../lib/recreation-gov\"\|from \"./recreation-gov\"" next/src --include="*.ts" --include="*.tsx" | grep -v recreation-gov.ts | grep -v recreation-gov.test.ts
```
Expected: zero matches.

- [ ] **Step 2: Delete the files**

```bash
rm next/src/lib/recreation-gov.ts next/src/lib/recreation-gov.test.ts
```

- [ ] **Step 3: Verify typecheck + tests**

```bash
cd /Users/mikeroberts/Code/campwatch/next && pnpm exec tsc --noEmit && pnpm exec vitest run
```
Expected: typecheck clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A next/src/lib
git commit -m "Remove dead client-side rec.gov library"
```

---

## Phase 5 — Notifier Writes Per-User Snapshots

After this phase, dashboard loads hit warm snapshot cache instead of running the live-fetch path on every request.

### Task 5.1: Write per-user snapshot in notifier

**Files:**
- Modify: `notifier/check.ts` (add snapshot write inside the per-user processing loop)

- [ ] **Step 1: Find the right insertion point**

The existing `computeMatchesForUser` function at line 180 builds `syntheticResults: CampgroundResult[]` — those have the same shape as `SnapshotCampground` minus the property names. Wrap it: after the loop in `computeMatchesForUser` builds `syntheticResults`, write a snapshot under the user's email key.

Add a new helper near `computeMatchesForUser`:
```typescript
import type { AvailabilitySnapshot, SnapshotCampground } from "../next/src/lib/recgov";

async function writeUserSnapshot(
    target: NotificationTarget,
    syntheticResults: CampgroundResult[],
): Promise<void> {
    if (!kvAdapter) return;
    const snapshot: AvailabilitySnapshot = {
        updatedAt: new Date().toISOString(),
        campgrounds: syntheticResults.map((r): SnapshotCampground => ({
            campgroundId: r.campgroundId,
            campgroundName: r.campgroundName,
            campgroundArea: r.campgroundArea,
            campgroundDescription: r.campgroundDescription,
            sites: r.sites,
        })),
    };
    try {
        await kvAdapter.putSnapshot(target.email, snapshot);
    } catch (e) {
        console.error(`[Snapshot] put failed for ${target.email}:`, (e as Error).message);
    }
}
```

- [ ] **Step 2: Call writeUserSnapshot inside computeMatchesForUser**

At the very end of `computeMatchesForUser`, just before its `return` (which currently returns `findNewMatches`'s output), make the function `async` (if it isn't already) and add:
```typescript
    await writeUserSnapshot(target, syntheticResults);
```

If `computeMatchesForUser` is currently synchronous, change its signature to `async` and update the call site to `await`.

- [ ] **Step 3: Verify notifier typechecks**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke run notifier**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier
SUBSCRIBER_API_URL="<...>" SUBSCRIBER_API_SECRET="<...>" RESEND_API_KEY="dryrun" SITE_URL="https://campwatch.dev" CLOUDFLARE_API_TOKEN="<...>" CLOUDFLARE_ACCOUNT_ID="<...>" CLOUDFLARE_KV_NAMESPACE_ID="<...>" npx tsx check.ts 2>&1 | grep -E "Snapshot|Fetch|KV"
```
Expected: see "[Fetch]" lines and no `[Snapshot] put failed` errors.

- [ ] **Step 5: Verify snapshot landed in KV**

Using wrangler:
```bash
cd /Users/mikeroberts/Code/campwatch/next
pnpm exec wrangler kv key get --namespace-id=41a67a8b06044ee38f0bf22cfbcc069d "snapshot:mikeroberts421@gmail.com"
```
Expected: returns a JSON blob with `updatedAt` and `campgrounds`.

- [ ] **Step 6: Commit**

```bash
git add notifier/check.ts
git commit -m "Notifier: write per-user availability snapshots to KV"
```

---

## Phase 6 — Watchlist Invalidation + Cleanup

### Task 6.1: Invalidate snapshot on watchlist write

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts`
- Modify: `next/src/app/api/users/me/campgrounds/items/route.ts`

- [ ] **Step 1: Add the import and call in the PUT handler**

In `next/src/app/api/users/me/campgrounds/route.ts`, near the existing imports, add:
```typescript
import { WorkerKvAdapter } from "@/lib/recgov";
```

In the existing `putHandler` (after the successful write to user campgrounds, before returning the response), add:
```typescript
const adapter = new WorkerKvAdapter(getKv());
await adapter.deleteSnapshot(session.email);
```

- [ ] **Step 2: Same in items route**

In `next/src/app/api/users/me/campgrounds/items/route.ts`, repeat the same pattern in each handler that mutates the user's campgrounds (POST / PUT / DELETE — check existing handler structure).

- [ ] **Step 3: Verify tests still pass**

```bash
cd /Users/mikeroberts/Code/campwatch/next
pnpm exec vitest run src/app/api/users/me/campgrounds
```
Expected: PASS. If any existing test now fails because the handler calls a new method on the mocked KV, extend the mock to include a no-op `delete`.

- [ ] **Step 4: Commit**

```bash
git add next/src/app/api/users/me/campgrounds/route.ts next/src/app/api/users/me/campgrounds/items/route.ts
git commit -m "Invalidate availability snapshot on watchlist mutations"
```

---

### Task 6.2: Delete stale `.mjs` artifacts

**Files:**
- Delete: `notifier/lib/email.mjs`, `notifier/check.mjs`

These are pre-TS-migration artifacts already identified as dead code earlier in this conversation. Nothing imports them — production runs `tsx check.ts`.

- [ ] **Step 1: Confirm nothing imports them**

```bash
grep -rn "email.mjs\|check.mjs" /Users/mikeroberts/Code/campwatch --include="*.ts" --include="*.mjs" --include="*.json" --include="*.yml" --include="*.yaml" | grep -v node_modules
```
Expected: zero matches.

- [ ] **Step 2: Delete**

```bash
rm notifier/lib/email.mjs notifier/check.mjs
```

- [ ] **Step 3: Verify**

```bash
cd /Users/mikeroberts/Code/campwatch/notifier && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A notifier/
git commit -m "Remove pre-TS-migration .mjs artifacts"
```

---

### Task 6.3: Final verification

- [ ] **Step 1: Full typecheck + tests, both packages**

```bash
cd /Users/mikeroberts/Code/campwatch/next && pnpm exec tsc --noEmit && pnpm exec vitest run
cd /Users/mikeroberts/Code/campwatch/notifier && pnpm exec tsc --noEmit
```
Expected: all green.

- [ ] **Step 2: Lint**

```bash
cd /Users/mikeroberts/Code/campwatch/next && pnpm exec eslint . --max-warnings 0
```
Expected: no errors.

- [ ] **Step 3: Browser network-tab verification**

Run `pnpm dev` in the `next/` package. Visit `/app` and `/discover`. DevTools Network tab:
- One call to `/api/availability` per page load.
- Zero calls to `recreation.gov`.

- [ ] **Step 4: Push and deploy**

```bash
git push origin main
```
Watch deploy workflow:
```bash
gh run list --branch main --workflow deploy-next.yml --limit 1
```
Expected: succeeds within ~1 min.

- [ ] **Step 5: Verify production**

Visit production `/app` (signed in). Open DevTools Network tab. Refresh. Expected:
- One call to `https://campwatch.dev/api/availability`.
- Zero calls to recreation.gov.

- [ ] **Step 6: Verify next notifier cron run**

```bash
gh run list --branch main --workflow check-campsites.yml --limit 2
```
Expected: next scheduled run succeeds. Spot-check logs for `[Fetch]` lines and absence of `[Snapshot] put failed` errors.

---

## Self-Review Notes

- **Spec coverage:** All six steps from the spec's Migration Plan map to phases 1–6. Anonymous `/discover` falling through to live-fetch via the raw cache layer is implemented in Task 3.2 (the route's `if (session)` branch).
- **Type consistency:** `AvailabilitySnapshot`, `SnapshotCampground`, `KvAdapter`, `WorkerKvAdapter`, `RestKvAdapter` referenced consistently across Phases 2, 3, 5, 6. The notifier's existing `CampgroundResult` type and the new `SnapshotCampground` share the same field shape; Task 5.1 maps between them explicitly.
- **No placeholders:** every code step contains the actual code to write or modify.
- **CF token handling:** Task 2.5 is manual but documents the exact UI path, scopes, and `gh secret set` commands.
