# Trip Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-defined trip date ranges that fire boosted, repeating "trip match" push/email alerts when a single site can host the whole (flex-adjusted) stay, per `docs/superpowers/specs/2026-07-22-trip-windows-design.md`.

**Architecture:** A `TripWindow[]` on `globalSettings` (mirrors `blackoutDates`) flows to the notifier via the existing notification-targets route. A shared pure lib (`next/src/lib/trip-windows.ts`) does all matching from raw rec.gov month data, used by the notifier (alerts + snapshot), the availability route (dashboard badge), and validation. A new `trips` dedup bucket with a 6h cooldown produces the every-6h re-alert; the notifier-state PUT route must merge-persist it (the `groups`-incident landmine).

**Tech Stack:** Next.js (app router, Cloudflare Workers via OpenNext), Cloudflare Worker notifier, TypeScript, Vitest, shadcn/ui + react-day-picker, Tailwind v4 with `cw-*` tokens.

## Global Constraints

- Dates are ISO `YYYY-MM-DD` strings; compare with string operators, never `Date` round-trips (`toISOString()` shifts days). Day arithmetic goes through UTC (`new Date(iso + "T00:00:00Z")`).
- `TripWindow.to` is the CHECKOUT day (nights are the half-open `[from, to)`), unlike `BlackoutRange` which is inclusive. `StayMatch` is also half-open, so runs and windows compare directly.
- The notifier bundles with esbuild and can only import pure TS from `next/src/**` (type + source imports fine); never import an npm package that lives only in `next/node_modules` from a file the notifier pulls in.
- New dedup buckets MUST be handled in `next/src/app/api/admin/notifier-state/route.ts` or they are silently dropped on write (caused the 2026-06-19 duplicate-email incident).
- Notifier tests/typecheck are NOT in CI. Run `npm test` and `npm run typecheck` in `notifier/` manually for every notifier task.
- `next/` CI gates prettier separately: run `pnpm format` (next/) and `npm run format` (notifier/) before each commit.
- No em dashes in new code comments, copy, or docs. Use commas, colons, or parentheses.
- Constants (copy exactly): `TRIP_MAX_WINDOWS = 10`, `TRIP_MAX_FLEX_DAYS = 3`, `TRIP_MAX_LABEL = 80`, `TRIP_FAST_LANE_LEAD_DAYS = 14`, `TRIP_COOLDOWN_MS = 6 * 60 * 60 * 1000`.
- Commit after every task (branch `trip-windows`, no push until Mike says so).

---

### Task 1: TripWindow types + shared matching lib

**Files:**
- Modify: `next/src/types/campground.ts` (add `TripWindow`, extend `GlobalSettings`, `ProcessedCampground`)
- Modify: `next/src/lib/recgov/cache.ts` (extend `SnapshotCampground`)
- Create: `next/src/lib/trip-windows.ts`
- Test: `next/src/lib/trip-windows.test.ts`

**Interfaces:**
- Consumes: `StayMatch`, `Campground`, `IGNORE_CAMPSITE_TYPES` (existing).
- Produces (later tasks rely on these exact names):
  - `interface TripWindow { id: string; from: string; to: string; label?: string; flexDays?: number; campgroundIds?: string[] }` in `@/types/campground`
  - `GlobalSettings.tripWindows?: TripWindow[]`
  - `ProcessedCampground.tripMatches?: TripSiteHit[]` and `SnapshotCampground.tripMatches?: TripSiteHit[]`
  - From `@/lib/trip-windows`: `TRIP_MAX_WINDOWS`, `TRIP_MAX_FLEX_DAYS`, `TRIP_MAX_LABEL`, `TRIP_FAST_LANE_LEAD_DAYS`, `interface TripSiteHit`, `addDaysIso(iso, days)`, `diffDays(fromIso, toIso)`, `coreRange(w)`, `windowIsPast(w, todayIso)`, `windowIsImminent(w, todayIso)`, `windowTargets(w, campgroundId)`, `activeWindowsFor(windows, campgroundId, todayIso)`, `isNightInWindow(nightIso, w)`, `isNightInAnyWindow(nightIso, windows)`, `siteMatchesWindow(openNights, w)`, `maximalRunInWindow(openNights, w)`, `openNightsBySiteFromRaw(rawApiResults)`, `tripHitsForCampground(rawApiResults, campground, windows, todayIso)`, `validTripWindows(v)`

- [ ] **Step 1: Add the types**

In `next/src/types/campground.ts`, after the `BlackoutRange` block (line ~113), add:

```ts
/** A user-level "I want to camp these dates" range. `from` is arrival, `to` is
 *  checkout, so the nights are the half-open [from, to) (unlike BlackoutRange,
 *  which is inclusive days). Openings covering the flex-shrunk core trigger
 *  boosted "trip match" alerts: notify scope bypassed, 6h re-alert cadence,
 *  one digest push per window. */
export interface TripWindow {
    /** crypto.randomUUID() at creation; keys dedup state and push tags. */
    id: string;
    from: string; // YYYY-MM-DD arrival (first night)
    to: string; // YYYY-MM-DD departure/checkout, > from
    label?: string; // <= 80 chars
    /** Each end may shrink by up to this many days (default 0, max 3). */
    flexDays?: number;
    /** Restrict to these watched campground ids. Absent/empty = all. */
    campgroundIds?: string[];
}
```

Extend `GlobalSettings`:

```ts
export interface GlobalSettings {
    stayLengths: number[];
    validStartDays: string[];
    /** Dates the user can't camp: greyed in views, excluded from the planner,
     *  and alert emails are suppressed for stays overlapping these nights. */
    blackoutDates?: BlackoutRange[];
    /** Dates the user is actively trying to book. See TripWindow. */
    tripWindows?: TripWindow[];
}
```

Extend `ProcessedCampground` (inside the existing interface) with:

```ts
    /** Sites that can host a trip window (server-computed; see lib/trip-windows). */
    tripMatches?: import("../lib/trip-windows").TripSiteHit[];
```

In `next/src/lib/recgov/cache.ts`, extend `SnapshotCampground`:

```ts
export interface SnapshotCampground extends Campground {
    siteAvailability: SiteAvailabilityMap;
    totalSitesCount: number;
    adjacentGroups?: import("../adjacent-groups").AdjacentGroup[];
    tripMatches?: import("../trip-windows").TripSiteHit[];
}
```

- [ ] **Step 2: Write the failing tests**

Create `next/src/lib/trip-windows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
    addDaysIso,
    diffDays,
    coreRange,
    windowIsPast,
    windowIsImminent,
    windowTargets,
    activeWindowsFor,
    isNightInWindow,
    siteMatchesWindow,
    maximalRunInWindow,
    openNightsBySiteFromRaw,
    tripHitsForCampground,
    validTripWindows,
    TRIP_MAX_WINDOWS,
} from "./trip-windows";
import type { TripWindow } from "@/types/campground";

const w = (over: Partial<TripWindow> = {}): TripWindow => ({
    id: "w1",
    from: "2026-07-30", // Thu arrival
    to: "2026-08-03", // Mon checkout (4 nights)
    ...over,
});

describe("date helpers", () => {
    it("addDaysIso crosses month boundaries without drift", () => {
        expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
        expect(addDaysIso("2026-08-01", -1)).toBe("2026-07-31");
    });
    it("diffDays counts whole days", () => {
        expect(diffDays("2026-07-30", "2026-08-03")).toBe(4);
    });
});

describe("coreRange", () => {
    it("is the window itself with no flex", () => {
        expect(coreRange(w())).toEqual({ from: "2026-07-30", to: "2026-08-03" });
    });
    it("shrinks each end by flexDays", () => {
        expect(coreRange(w({ flexDays: 1 }))).toEqual({ from: "2026-07-31", to: "2026-08-02" });
    });
});

describe("window predicates", () => {
    it("windowIsPast once checkout day arrives", () => {
        expect(windowIsPast(w(), "2026-08-02")).toBe(false);
        expect(windowIsPast(w(), "2026-08-03")).toBe(true);
    });
    it("windowIsImminent inside the 14-day lead, not when past", () => {
        expect(windowIsImminent(w(), "2026-07-15")).toBe(false);
        expect(windowIsImminent(w(), "2026-07-16")).toBe(true);
        expect(windowIsImminent(w(), "2026-08-02")).toBe(true);
        expect(windowIsImminent(w(), "2026-08-03")).toBe(false);
    });
    it("windowTargets: absent/empty means all", () => {
        expect(windowTargets(w(), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: [] }), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: ["123"] }), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: ["999"] }), "123")).toBe(false);
    });
    it("activeWindowsFor filters past and non-targeting windows", () => {
        const wins = [w(), w({ id: "w2", from: "2026-06-01", to: "2026-06-03" })];
        expect(activeWindowsFor(wins, "123", "2026-07-22").map((x) => x.id)).toEqual(["w1"]);
    });
    it("isNightInWindow is half-open (checkout night excluded)", () => {
        expect(isNightInWindow("2026-07-30", w())).toBe(true);
        expect(isNightInWindow("2026-08-02", w())).toBe(true);
        expect(isNightInWindow("2026-08-03", w())).toBe(false);
    });
});

describe("matching", () => {
    const nights = (...days: string[]) => new Set(days);
    it("requires every core night with no flex", () => {
        const open = nights("2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02");
        expect(siteMatchesWindow(open, w())).toBe(true);
        open.delete("2026-08-01");
        expect(siteMatchesWindow(open, w())).toBe(false);
    });
    it("flex 1 accepts Fri->Mon, Thu->Sun, and Fri->Sun", () => {
        const win = w({ flexDays: 1 });
        expect(siteMatchesWindow(nights("2026-07-31", "2026-08-01"), win)).toBe(true); // Fri+Sat only
        expect(siteMatchesWindow(nights("2026-07-31"), win)).toBe(false); // missing Sat core night
    });
    it("maximalRunInWindow expands from the core to the window edges", () => {
        const win = w({ flexDays: 1 });
        const open = nights("2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02");
        expect(maximalRunInWindow(open, win)).toEqual({ from: "2026-07-30", to: "2026-08-03", nights: 4 });
        // Only the core open: run = core
        expect(maximalRunInWindow(nights("2026-07-31", "2026-08-01"), win)).toEqual({
            from: "2026-07-31",
            to: "2026-08-02",
            nights: 2,
        });
        expect(maximalRunInWindow(nights("2026-07-31"), win)).toBeNull();
    });
});

describe("openNightsBySiteFromRaw", () => {
    it("merges months, normalizes datetimes, skips ignored types and null slots", () => {
        const raw = [
            {
                campsites: {
                    "111": {
                        site: "A01",
                        campsite_type: "STANDARD NONELECTRIC",
                        availabilities: {
                            "2026-07-30T00:00:00Z": "Available",
                            "2026-07-31T00:00:00Z": "Reserved",
                        },
                    },
                    "222": { site: "GRP", campsite_type: "WALK TO", availabilities: {} },
                },
            },
            null,
            {
                campsites: {
                    "111": {
                        site: "A01",
                        campsite_type: "STANDARD NONELECTRIC",
                        availabilities: { "2026-08-01T00:00:00Z": "Available" },
                    },
                },
            },
        ];
        const by = openNightsBySiteFromRaw(raw);
        expect(by.has("222")).toBe(false);
        expect([...by.get("111")!.nights].sort()).toEqual(["2026-07-30", "2026-08-01"]);
        expect(by.get("111")!.siteName).toBe("A01");
    });
});

describe("tripHitsForCampground", () => {
    const cg = { id: "233563", name: "Point CG", sites: { favorites: ["A01"], worthwhile: ["B02"] } };
    const raw = [
        {
            campsites: {
                "111": {
                    site: "A01",
                    campsite_type: "STANDARD NONELECTRIC",
                    availabilities: {
                        "2026-07-31T00:00:00Z": "Available",
                        "2026-08-01T00:00:00Z": "Available",
                    },
                },
                "333": {
                    site: "C03",
                    campsite_type: "STANDARD NONELECTRIC",
                    availabilities: { "2026-07-31T00:00:00Z": "Available" },
                },
            },
        },
    ];
    it("returns hits with tier and maximal run; bypasses nothing it shouldn't", () => {
        const win = w({ from: "2026-07-31", to: "2026-08-02" }); // Fri->Sun, 2 nights
        const hits = tripHitsForCampground(raw, cg, [win], "2026-07-22");
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({
            windowId: "w1",
            campgroundId: "233563",
            campgroundName: "Point CG",
            siteId: "111",
            siteName: "A01",
            tier: "favorites",
            run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
        });
    });
    it("skips past windows and non-targeting windows", () => {
        const past = w({ from: "2026-07-01", to: "2026-07-03" });
        const elsewhere = w({ id: "w9", from: "2026-07-31", to: "2026-08-02", campgroundIds: ["999"] });
        expect(tripHitsForCampground(raw, cg, [past, elsewhere], "2026-07-22")).toEqual([]);
    });
});

describe("validTripWindows", () => {
    const valid = { id: "a", from: "2026-07-31", to: "2026-08-02" };
    it("accepts undefined and a valid list", () => {
        expect(validTripWindows(undefined)).toBe(true);
        expect(validTripWindows([valid])).toBe(true);
        expect(validTripWindows([{ ...valid, label: "x", flexDays: 0, campgroundIds: ["1"] }])).toBe(true);
    });
    it("rejects bad shapes", () => {
        expect(validTripWindows("nope")).toBe(false);
        expect(validTripWindows([{ ...valid, id: "" }])).toBe(false);
        expect(validTripWindows([{ ...valid, from: "2026-7-31" }])).toBe(false);
        expect(validTripWindows([{ ...valid, to: "2026-07-31" }])).toBe(false); // from >= to
        expect(validTripWindows([{ ...valid, label: "x".repeat(81) }])).toBe(false);
        expect(validTripWindows([{ ...valid, flexDays: 1 }])).toBe(false); // 2 nights <= 2*1
        expect(validTripWindows([{ ...valid, flexDays: 1.5 }])).toBe(false);
        expect(validTripWindows([{ ...valid, campgroundIds: [42] }])).toBe(false);
        expect(validTripWindows(Array.from({ length: TRIP_MAX_WINDOWS + 1 }, (_, i) => ({ ...valid, id: `w${i}` })))).toBe(false);
    });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `cd next && pnpm vitest run src/lib/trip-windows.test.ts`
Expected: FAIL (module `./trip-windows` not found).

- [ ] **Step 4: Implement the lib**

Create `next/src/lib/trip-windows.ts`:

```ts
// Trip windows: user-declared "I want to camp these dates" ranges that boost
// alerts. Matching is deliberately independent of stayLengths/validStartDays,
// notify scope, blackouts, and the campground watch dates: a trip match means
// "this one site can host the whole (flex-adjusted) stay".
// ISO YYYY-MM-DD strings compare correctly as strings; day arithmetic goes
// through UTC so DST can't shift a calendar day.

import { IGNORE_CAMPSITE_TYPES } from "@/lib/recgov/types";
import type { StayMatch, TripWindow, Campground } from "@/types/campground";

export const TRIP_MAX_WINDOWS = 10;
export const TRIP_MAX_FLEX_DAYS = 3;
export const TRIP_MAX_LABEL = 80;
/** Fast-lane (every-minute) polling starts this many days before arrival. */
export const TRIP_FAST_LANE_LEAD_DAYS = 14;

export interface TripSiteHit {
    windowId: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName: string;
    tier: "favorites" | "worthwhile" | "all-others";
    /** Maximal consecutive open run within [window.from, window.to) covering the core. */
    run: StayMatch;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDaysIso(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (positive when to > from). */
export function diffDays(fromIso: string, toIso: string): number {
    return Math.round(
        (Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / DAY_MS,
    );
}

/** The nights that MUST be open: the window shrunk by flexDays on each end. */
export function coreRange(w: TripWindow): { from: string; to: string } {
    const flex = w.flexDays ?? 0;
    return { from: addDaysIso(w.from, flex), to: addDaysIso(w.to, -flex) };
}

/** Checkout day has arrived or passed (the last night is to - 1). */
export function windowIsPast(w: TripWindow, todayIso: string): boolean {
    return w.to <= todayIso;
}

/** Inside the fast-lane lead window and not past. */
export function windowIsImminent(w: TripWindow, todayIso: string): boolean {
    return !windowIsPast(w, todayIso) && addDaysIso(w.from, -TRIP_FAST_LANE_LEAD_DAYS) <= todayIso;
}

export function windowTargets(w: TripWindow, campgroundId: string): boolean {
    return !w.campgroundIds || w.campgroundIds.length === 0 || w.campgroundIds.includes(campgroundId);
}

/** Non-past windows that target the campground. */
export function activeWindowsFor(
    windows: TripWindow[] | undefined,
    campgroundId: string,
    todayIso: string,
): TripWindow[] {
    return (windows ?? []).filter((w) => !windowIsPast(w, todayIso) && windowTargets(w, campgroundId));
}

export function isNightInWindow(nightIso: string, w: TripWindow): boolean {
    return w.from <= nightIso && nightIso < w.to;
}

export function isNightInAnyWindow(nightIso: string, windows: TripWindow[] | undefined): boolean {
    return (windows ?? []).some((w) => isNightInWindow(nightIso, w));
}

/** Every core night open at this site. */
export function siteMatchesWindow(openNights: ReadonlySet<string>, w: TripWindow): boolean {
    const core = coreRange(w);
    if (core.from >= core.to) return false; // flex ate the window; validation prevents this
    for (let night = core.from; night < core.to; night = addDaysIso(night, 1)) {
        if (!openNights.has(night)) return false;
    }
    return true;
}

/** Longest consecutive open run inside [w.from, w.to) containing the core, or
 *  null when the core isn't fully open. This is what alerts display and what
 *  the dedup state records. */
export function maximalRunInWindow(openNights: ReadonlySet<string>, w: TripWindow): StayMatch | null {
    if (!siteMatchesWindow(openNights, w)) return null;
    const core = coreRange(w);
    let from = core.from;
    while (from > w.from && openNights.has(addDaysIso(from, -1))) from = addDaysIso(from, -1);
    let to = core.to;
    while (to < w.to && openNights.has(to)) to = addDaysIso(to, 1);
    return { from, to, nights: diffDays(from, to) };
}

interface RawSiteMonth {
    site: string;
    campsite_type: string;
    availabilities: Record<string, string>;
}

/** Open nights per siteId from raw rec.gov month blobs. Null slots (cache
 *  misses) are skipped; datetimes normalize to YYYY-MM-DD; only "Available"
 *  nights count; ignored campsite types are dropped. */
export function openNightsBySiteFromRaw(
    rawApiResults: unknown[] | null | undefined,
): Map<string, { siteId: string; siteName: string; nights: Set<string> }> {
    const out = new Map<string, { siteId: string; siteName: string; nights: Set<string> }>();
    for (const raw of (rawApiResults ?? []) as Array<{
        campsites?: Record<string, RawSiteMonth>;
    } | null>) {
        if (!raw?.campsites) continue;
        for (const [siteId, siteData] of Object.entries(raw.campsites)) {
            if (IGNORE_CAMPSITE_TYPES.includes(siteData.campsite_type)) continue;
            let entry = out.get(siteId);
            if (!entry) {
                entry = { siteId, siteName: siteData.site, nights: new Set() };
                out.set(siteId, entry);
            }
            for (const [date, status] of Object.entries(siteData.availabilities)) {
                if (status !== "Available") continue;
                const day = date.split("T")[0];
                if (day) entry.nights.add(day);
            }
        }
    }
    return out;
}

/** All trip hits at one campground for the user's windows. */
export function tripHitsForCampground(
    rawApiResults: unknown[] | null | undefined,
    campground: Pick<Campground, "id" | "name" | "sites">,
    windows: TripWindow[] | undefined,
    todayIso: string,
): TripSiteHit[] {
    const active = activeWindowsFor(windows, campground.id, todayIso);
    if (active.length === 0) return [];
    const bySite = openNightsBySiteFromRaw(rawApiResults);
    if (bySite.size === 0) return [];
    const favorites = new Set(campground.sites?.favorites ?? []);
    const worthwhile = new Set(campground.sites?.worthwhile ?? []);
    const hits: TripSiteHit[] = [];
    for (const w of active) {
        for (const site of bySite.values()) {
            const run = maximalRunInWindow(site.nights, w);
            if (!run) continue;
            const tier = favorites.has(site.siteName)
                ? ("favorites" as const)
                : worthwhile.has(site.siteName)
                  ? ("worthwhile" as const)
                  : ("all-others" as const);
            hits.push({
                windowId: w.id,
                campgroundId: campground.id,
                campgroundName: campground.name,
                siteId: site.siteId,
                siteName: site.siteName,
                tier,
                run,
            });
        }
    }
    return hits;
}

/** PUT-body validation for globalSettings.tripWindows. */
export function validTripWindows(v: unknown): boolean {
    if (v === undefined) return true;
    if (!Array.isArray(v) || v.length > TRIP_MAX_WINDOWS) return false;
    return v.every((r) => {
        if (!r || typeof r !== "object") return false;
        const w = r as Partial<TripWindow>;
        if (typeof w.id !== "string" || w.id.length === 0 || w.id.length > 64) return false;
        if (typeof w.from !== "string" || !ISO_DAY_RE.test(w.from)) return false;
        if (typeof w.to !== "string" || !ISO_DAY_RE.test(w.to)) return false;
        if (w.from >= w.to) return false;
        if (w.label !== undefined && (typeof w.label !== "string" || w.label.length > TRIP_MAX_LABEL))
            return false;
        if (w.flexDays !== undefined) {
            if (typeof w.flexDays !== "number" || !Number.isInteger(w.flexDays)) return false;
            if (w.flexDays < 0 || w.flexDays > TRIP_MAX_FLEX_DAYS) return false;
            // The core must keep at least one night.
            if (diffDays(w.from, w.to) <= 2 * w.flexDays) return false;
        }
        if (w.campgroundIds !== undefined) {
            if (!Array.isArray(w.campgroundIds) || w.campgroundIds.length > 100) return false;
            if (!w.campgroundIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64))
                return false;
        }
        return true;
    });
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/lib/trip-windows.test.ts`
Expected: PASS. Also run `pnpm tsc --noEmit` (baseline: 2 pre-existing errors in template.ts are OK; no NEW errors).

- [ ] **Step 6: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Add TripWindow types and shared trip-windows matching lib"
```

---

### Task 2: Validate + prune tripWindows in the campgrounds PUT route

**Files:**
- Modify: `next/src/app/api/users/me/campgrounds/route.ts`
- Test: `next/src/app/api/users/me/campgrounds/route.test.ts` (extend)

**Interfaces:**
- Consumes: `validTripWindows`, `windowIsPast` from `@/lib/trip-windows` (Task 1).
- Produces: `PUT /api/users/me/campgrounds` accepts `globalSettings.tripWindows`, 400s invalid lists, and drops past windows before storing.

- [ ] **Step 1: Write the failing tests**

Append to `route.test.ts` (inside the existing PUT describe block or a new one; reuse the existing `doPut` helper and session/kv mocks; look at the existing "PUT" tests in the same file for the `readSession`/`getKv` setup lines to copy):

```ts
describe("PUT tripWindows validation", () => {
    function sessionAndKv() {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        return kv;
    }
    const base = {
        campgrounds: { "recreation.gov": [] },
        globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
    };
    const futureFrom = "2100-07-31";
    const futureTo = "2100-08-02";

    it("rejects an invalid tripWindows list", async () => {
        sessionAndKv();
        const res = await doPut({
            ...base,
            globalSettings: {
                ...base.globalSettings,
                tripWindows: [{ id: "", from: futureFrom, to: futureTo }],
            },
        });
        expect(res.status).toBe(400);
    });

    it("stores a valid tripWindows list", async () => {
        sessionAndKv();
        const res = await doPut({
            ...base,
            globalSettings: {
                ...base.globalSettings,
                tripWindows: [{ id: "w1", from: futureFrom, to: futureTo, flexDays: 0 }],
            },
        });
        expect(res.status).toBe(200);
        const stored = (await (await doGet()).json()) as {
            globalSettings: { tripWindows?: unknown[] };
        };
        expect(stored.globalSettings.tripWindows).toHaveLength(1);
    });

    it("prunes past windows on save", async () => {
        sessionAndKv();
        const res = await doPut({
            ...base,
            globalSettings: {
                ...base.globalSettings,
                tripWindows: [
                    { id: "old", from: "2020-07-31", to: "2020-08-02" },
                    { id: "new", from: futureFrom, to: futureTo },
                ],
            },
        });
        expect(res.status).toBe(200);
        const stored = (await (await doGet()).json()) as {
            globalSettings: { tripWindows?: Array<{ id: string }> };
        };
        expect(stored.globalSettings.tripWindows?.map((w) => w.id)).toEqual(["new"]);
    });
});
```

(The PUT and follow-up GET share the same mocked KV within a test, and `getUserCampgrounds` is unmocked in this file, so the GET reads back exactly what the PUT stored. Keep `vi.resetModules()` semantics in mind: both `doPut` and `doGet` dynamic-import the route, which is fine within one test.)

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `cd next && pnpm vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: new tests FAIL (invalid list passes through today, no pruning).

- [ ] **Step 3: Implement**

In `route.ts`, add imports:

```ts
import { validTripWindows, windowIsPast } from "@/lib/trip-windows";
import type { TripWindow } from "@/types/campground";
```

After the blackout validation block (after line ~103), add:

```ts
    const gsTrips = body.globalSettings as { tripWindows?: unknown };
    if (!validTripWindows(gsTrips.tripWindows)) {
        return withCors(
            jsonResponse(
                {
                    error: "tripWindows must be valid ranges (id, YYYY-MM-DD from < to, label <= 80, flex 0-3 leaving >= 1 core night, max 10)",
                },
                400,
            ),
        );
    }
    // Past windows are dead weight: drop them on every save.
    if (Array.isArray(gsTrips.tripWindows)) {
        const todayIso = new Date().toISOString().slice(0, 10);
        gsTrips.tripWindows = (gsTrips.tripWindows as TripWindow[]).filter(
            (w) => !windowIsPast(w, todayIso),
        );
    }
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/app/api/users/me/campgrounds/route.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Validate and prune globalSettings.tripWindows in campgrounds PUT"
```

---

### Task 3: Persist the `trips` dedup bucket (the landmine)

**Files:**
- Modify: `next/src/lib/notifier-state-merge.ts` (add `TRIP_COOLDOWN_MS`)
- Modify: `next/src/app/api/admin/notifier-state/route.ts`
- Test: `next/src/app/api/admin/notifier-state/route.test.ts` (extend)

**Interfaces:**
- Produces: `export const TRIP_COOLDOWN_MS = 6 * 60 * 60 * 1000` from `@/lib/notifier-state-merge` (the notifier imports this in Task 6). PUT route merges and persists a `trips` bucket with `mergeNotifierSites(existing, incoming, nowMs, TRIP_COOLDOWN_MS)`, included in the stored blob only when non-empty.

- [ ] **Step 1: Add the constant**

In `next/src/lib/notifier-state-merge.ts`, under `COOLDOWN_MS`:

```ts
// Trip-match re-alert cadence. Shorter than the normal cooldown on purpose:
// a still-open trip site ages out of this bucket and re-fires every 6h until
// the window passes or it's booked. Keep in lockstep with notifier/check.ts.
export const TRIP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
```

- [ ] **Step 2: Write the failing tests**

Append inside the existing `describe("PUT /api/admin/notifier-state")` block in `next/src/app/api/admin/notifier-state/route.test.ts` (it already defines `SECRET`, `recentIso`, the `put(body, authHeader)` helper, and `createMockKv`):

```ts
    it("merge-persists the trips bucket with the 6h cooldown", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        // Past the 6h trip cooldown but inside the 24h sites cooldown.
        const sevenHoursIso = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
        const kv = createMockKv({
            "user:mike@x.com:notifier-state": JSON.stringify({
                sites: { "232431:18649": [{ from: "2026-07-16", to: "2026-07-19", seen: sevenHoursIso }] },
                trips: {
                    "w1:232431:18649": [{ from: "2026-07-31", to: "2026-08-02", seen: recentIso }],
                    "w1:232431:99999": [{ from: "2026-07-31", to: "2026-08-02", seen: sevenHoursIso }],
                },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await put(
            {
                updates: [
                    {
                        email: "mike@x.com",
                        state: {
                            sites: {},
                            trips: {
                                "w2:232085:53676": [
                                    { from: "2026-08-07", to: "2026-08-09", seen: recentIso },
                                ],
                            },
                        },
                    },
                ],
            },
            `Bearer ${SECRET}`,
        );

        expect(res.status).toBe(200);
        const state = (await kv.get("user:mike@x.com:notifier-state", "json")) as {
            sites: Record<string, unknown>;
            trips?: Record<string, unknown[]>;
        };
        // Union merge: existing fresh trip range kept, incoming added.
        expect(state.trips?.["w1:232431:18649"]).toBeDefined();
        expect(state.trips?.["w2:232085:53676"]).toBeDefined();
        // 6h cooldown: the 7h-old trip range aged out...
        expect(state.trips?.["w1:232431:99999"]).toBeUndefined();
        // ...while the 7h-old sites range survives its 24h cooldown.
        expect(state.sites["232431:18649"]).toBeDefined();
    });

    it("omits the trips key when the merge comes out empty", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put(
            {
                updates: [
                    {
                        email: "mike@x.com",
                        state: {
                            sites: { "1:2": [{ from: "2026-08-01", to: "2026-08-03", seen: recentIso }] },
                        },
                    },
                ],
            },
            `Bearer ${SECRET}`,
        );
        expect(res.status).toBe(200);
        const state = (await kv.get("user:mike@x.com:notifier-state", "json")) as Record<string, unknown>;
        expect("trips" in state).toBe(false);
    });
```

- [ ] **Step 3: Run tests, verify new ones fail**

Run: `cd next && pnpm vitest run src/app/api/admin/notifier-state/route.test.ts`
Expected: FAIL (trips silently dropped today).

- [ ] **Step 4: Implement the route change**

In `route.ts`, update the import and merge block:

```ts
import { mergeNotifierSites, TRIP_COOLDOWN_MS, type NotifierSites } from "@/lib/notifier-state-merge";
```

Replace the existing/incoming/nextBlob section (lines ~58-69) with:

```ts
        const existing = (await kv.get(key, "json")) as {
            sites?: NotifierSites;
            groups?: NotifierSites;
            trips?: NotifierSites;
        } | null;
        const incoming = (entry.state ?? {}) as {
            sites?: NotifierSites;
            groups?: NotifierSites;
            trips?: NotifierSites;
        };
        const sites = mergeNotifierSites(existing?.sites, incoming.sites, nowMs);
        // The adjacent-group dedup bucket has the same shape as `sites`
        // (key -> SeenRange[]) and the same overlapping-cron clobber risk, so it
        // gets the identical merge. Dropping it here meant group cooldown state
        // never persisted, so the same adjacent-site email re-sent every cycle.
        const groups = mergeNotifierSites(existing?.groups, incoming.groups, nowMs);
        // Trip-match bucket: same shape again, but a 6h cooldown. The age-out IS
        // the re-alert cadence (still-open trip sites re-fire when their range
        // expires here), so do not "fix" this to the 24h cooldown.
        const trips = mergeNotifierSites(existing?.trips, incoming.trips, nowMs, TRIP_COOLDOWN_MS);
        const nextBlob: { sites: NotifierSites; groups?: NotifierSites; trips?: NotifierSites } = { sites };
        if (Object.keys(groups).length > 0) nextBlob.groups = groups;
        if (Object.keys(trips).length > 0) nextBlob.trips = trips;
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/app/api/admin/notifier-state/route.test.ts && pnpm vitest run src/lib/notifier-state-merge.test.ts`
Expected: PASS.

- [ ] **Step 6: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Merge-persist the trips dedup bucket in notifier-state PUT (6h cooldown)"
```

---

### Task 4: Fetch plans cover trip-window months + fast-lane boost

**Files:**
- Modify: `notifier/fetch-jobs.ts`
- Test: `notifier/fetch-jobs.test.ts` (extend)

**Interfaces:**
- Consumes: `activeWindowsFor`, `addDaysIso`, `windowIsImminent` from `../next/src/lib/trip-windows`; `TripWindow` type.
- Produces: `PlannableTarget` gains `globalSettings?: { tripWindows?: TripWindow[] }`. `buildFastLanePlan(targets, nowMonth, todayIso?)`, `buildSweepPlan(targets, minute, nowMonth, todayIso?)`, `buildNotifyPlan(targets, nowMonth, todayIso?)`. All backward compatible when `todayIso` is omitted.

- [ ] **Step 1: Write the failing tests**

Append to `notifier/fetch-jobs.test.ts` (mirror the existing target-fixture style in that file):

```ts
describe("trip-window months", () => {
    const TODAY = "2026-07-22";
    const NOW_MONTH = "2026-07";
    const cg = (over: Record<string, unknown> = {}) => ({
        id: "233563",
        name: "Point",
        sites: { favorites: [], worthwhile: [] },
        dates: { startDate: "2026-07-01", endDate: "2026-07-31" },
        enabled: true,
        ...over,
    });
    const target = (campground: unknown, tripWindows?: unknown[]) =>
        ({
            campgrounds: { "recreation.gov": [campground] },
            ...(tripWindows ? { globalSettings: { tripWindows } } : {}),
        }) as never;

    it("notify plan unions trip-window months beyond the watch dates", () => {
        const t = target(cg(), [{ id: "w1", from: "2026-09-04", to: "2026-09-07" }]);
        const months = buildNotifyPlan([t], NOW_MONTH, TODAY).map((p) => p.month).sort();
        expect(months).toEqual(["2026-07", "2026-09"]);
    });

    it("covers a campground with no watch dates via its trip window", () => {
        const t = target(cg({ dates: undefined }), [{ id: "w1", from: "2026-08-07", to: "2026-08-09" }]);
        expect(buildNotifyPlan([t], NOW_MONTH, TODAY)).toEqual([
            { campgroundId: "233563", month: "2026-08" },
        ]);
    });

    it("fast lane boosts a normal-tier campground only for an imminent window", () => {
        const imminent = [{ id: "w1", from: "2026-07-31", to: "2026-08-02" }];
        const distant = [{ id: "w2", from: "2026-10-02", to: "2026-10-04" }];
        expect(buildFastLanePlan([target(cg(), imminent)], NOW_MONTH, TODAY).length).toBeGreaterThan(0);
        expect(buildFastLanePlan([target(cg(), distant)], NOW_MONTH, TODAY)).toEqual([]);
        // Boost fetches only the window months, not the whole season.
        const months = buildFastLanePlan([target(cg(), imminent)], NOW_MONTH, TODAY)
            .map((p) => p.month)
            .sort();
        expect(months).toEqual(["2026-07", "2026-08"]);
    });

    it("window checkout on the 1st does not drag in the extra month", () => {
        const t = target(cg({ dates: undefined }), [{ id: "w1", from: "2026-08-28", to: "2026-09-01" }]);
        const months = buildNotifyPlan([t], NOW_MONTH, TODAY).map((p) => p.month).sort();
        expect(months).toEqual(["2026-08"]);
    });

    it("omitting todayIso keeps legacy behavior", () => {
        const t = target(cg(), [{ id: "w1", from: "2026-09-04", to: "2026-09-07" }]);
        expect(buildNotifyPlan([t], NOW_MONTH).map((p) => p.month)).toEqual(["2026-07"]);
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd notifier && npm test -- fetch-jobs`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

In `notifier/fetch-jobs.ts`: add imports, extend `PlannableTarget`, rework `buildPlan`:

```ts
import { activeWindowsFor, addDaysIso, windowIsImminent } from "../next/src/lib/trip-windows";
import type { TripWindow } from "../next/src/types/campground";

export interface PlannableTarget {
    campgrounds: { "recreation.gov"?: Campground[] };
    globalSettings?: { tripWindows?: TripWindow[] };
}

// Months a set of windows needs fetched. `to` is checkout, so the last night
// (and last month) is the day before.
function tripMonths(windows: TripWindow[], nowMonth: string): string[] {
    const months = new Set<string>();
    for (const w of windows) {
        for (const m of monthsBetween(w.from, addDaysIso(w.to, -1))) {
            if (m >= nowMonth) months.add(m);
        }
    }
    return [...months];
}

function buildPlan(
    targets: PlannableTarget[],
    tiers: CheckPriority[],
    nowMonth: string,
    minute?: number,
    todayIso?: string,
    opts?: { imminentTripBoost?: boolean },
): FetchPlanItem[] {
    const ranges = new Map<string, Set<string>>();
    for (const target of targets) {
        for (const c of target.campgrounds["recreation.gov"] ?? []) {
            if (c.enabled === false) continue;
            const tier = tierOf(c);
            const inTier =
                tiers.includes(tier) &&
                (minute === undefined || minute % CHECK_PRIORITY_INTERVAL_MINUTES[tier] === 0);
            const windows = todayIso
                ? activeWindowsFor(target.globalSettings?.tripWindows, c.id, todayIso)
                : [];

            const months = new Set<string>();
            if (inTier) {
                const start = c.dates?.startDate;
                const end = c.dates?.endDate;
                if (start && end) {
                    for (const m of monthsBetween(start, end)) if (m >= nowMonth) months.add(m);
                }
                for (const m of tripMonths(windows, nowMonth)) months.add(m);
            } else if (opts?.imminentTripBoost && todayIso) {
                // Out-of-tier campgrounds ride the fast lane for imminent trip
                // windows only, and only for the window months (not the season).
                const imminent = windows.filter((w) => windowIsImminent(w, todayIso));
                for (const m of tripMonths(imminent, nowMonth)) months.add(m);
            }
            if (months.size === 0) continue;
            if (!ranges.has(c.id)) ranges.set(c.id, new Set());
            for (const m of months) ranges.get(c.id)!.add(m);
        }
    }
    const plan: FetchPlanItem[] = [];
    for (const [campgroundId, monthSet] of ranges)
        for (const month of monthSet) plan.push({ campgroundId, month });
    return plan;
}

export function buildFastLanePlan(
    targets: PlannableTarget[],
    nowMonth: string,
    todayIso?: string,
): FetchPlanItem[] {
    return buildPlan(targets, ["high"], nowMonth, undefined, todayIso, { imminentTripBoost: true });
}

export function buildSweepPlan(
    targets: PlannableTarget[],
    minute: number,
    nowMonth: string,
    todayIso?: string,
): FetchPlanItem[] {
    return buildPlan(targets, ["normal", "low"], nowMonth, minute, todayIso);
}

export function buildNotifyPlan(
    targets: PlannableTarget[],
    nowMonth: string,
    todayIso?: string,
): FetchPlanItem[] {
    return buildPlan(targets, ["high", "normal", "low"], nowMonth, undefined, todayIso);
}
```

Delete the old per-campground body that `buildPlan` replaced (the `start/end` block). Keep `monthsBetween`, `tierOf`, `readCachedMonths`, `fetchToCache` unchanged.

Wait on the fast-lane test expecting `["2026-07", "2026-08"]`: the fixture campground is normal-tier, so `inTier` is false for `["high"]` and only the boost path runs; the window `2026-07-31 -> 2026-08-02` spans July and August nights, hence both months. Correct as written.

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd notifier && npm test -- fetch-jobs && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Format + commit**

```bash
cd notifier && npm run format
git add -A && git commit -m "Fetch plans cover trip-window months; fast lane boosts imminent windows"
```

---

### Task 5: Email formatter renders trip digests

**Files:**
- Modify: `notifier/lib/email.ts`
- Test: `notifier/lib/email.test.ts` (extend)

**Interfaces:**
- Consumes: `TripWindow` (types/campground), `TripSiteHit` (lib/trip-windows), both type-only.
- Produces: `export interface TripEmailDigest { window: TripWindow; hits: TripSiteHit[] }`; `FormatEmailOptions.tripDigests?: TripEmailDigest[]`; exported `buildTripPreheaderText(digests)`. Subject leads with `Trip match: <label or dates> · N site(s)` when digests are present. `formatEmail([], { tripDigests })` produces a valid email.

- [ ] **Step 1: Write the failing tests**

Append to `notifier/lib/email.test.ts`:

```ts
import type { TripEmailDigest } from "./email";

describe("trip digests in email", () => {
    const digest: TripEmailDigest = {
        window: { id: "w1", from: "2026-07-31", to: "2026-08-02", label: "Lake weekend" },
        hits: [
            {
                windowId: "w1",
                campgroundId: "233563",
                campgroundName: "Point Campground",
                siteId: "111",
                siteName: "A01",
                tier: "favorites",
                run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
            },
        ],
    };

    it("subject leads with the trip match", () => {
        const { subject } = formatEmail([], { tripDigests: [digest] });
        expect(subject).toBe("Trip match: Lake weekend · 1 site");
    });

    it("falls back to formatted dates when the window has no label", () => {
        const unlabeled = { ...digest, window: { ...digest.window, label: undefined } };
        const { subject } = formatEmail([], { tripDigests: [unlabeled] });
        expect(subject).toContain("Trip match: Fri Jul 31");
    });

    it("renders a trip section with a book link and survives zero normal matches", () => {
        const { html } = formatEmail([], { tripDigests: [digest] });
        expect(html).toContain("Trip match");
        expect(html).toContain("Point Campground");
        expect(html).toContain(
            "https://www.recreation.gov/camping/campsites/111?arrivalDate=2026-07-31&departureDate=2026-08-02",
        );
    });

    it("buildTripPreheaderText leads with the first hit", () => {
        expect(buildTripPreheaderText([digest])).toContain("A01");
    });
});
```

Add `buildTripPreheaderText` to the import list at the top of the test file.

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd notifier && npm test -- email`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `notifier/lib/email.ts`:

Add type imports at top:

```ts
import type { TripWindow } from "../../next/src/types/campground";
import type { TripSiteHit } from "../../next/src/lib/trip-windows";
```

Add to the types section:

```ts
export interface TripEmailDigest {
    window: TripWindow;
    hits: TripSiteHit[];
}
```

Add `tripDigests?: TripEmailDigest[];` to `FormatEmailOptions` with the doc line `/** Trip-window digests to feature above everything else. */`.

Add the preheader helper next to `buildPreheaderText`:

```ts
/** Preheader for trip-led emails: first hit's campground, site, arrival, nights. */
export const buildTripPreheaderText = (digests: TripEmailDigest[]): string => {
    const first = digests[0]?.hits[0];
    if (!first) return "Trip match on your watchlist";
    const total = digests.reduce((n, d) => n + d.hits.length, 0);
    const star = first.tier === "favorites" ? "★ " : "";
    const lead = `${star}${first.campgroundName} ${first.siteName} · ${formatDate(first.run.from)} · ${first.run.nights} ${first.run.nights === 1 ? "night" : "nights"}`;
    const remaining = total - 1;
    return remaining > 0 ? `${lead} +${remaining} more site${remaining === 1 ? "" : "s"}` : lead;
};
```

Change `buildPreheader` to take an optional override:

```ts
const buildPreheader = (matches: MatchResult[], overrideText?: string): string => {
    const text = overrideText ?? buildPreheaderText(matches);
```

Add the trip card + section builders (place next to `buildAdjacentSection`; same table/card idiom, clay eyebrow, per-hit book buttons capped at 6):

```ts
const TRIP_MAX_EMAIL_HITS = 6;

const tripWindowLabel = (w: TripWindow): string =>
    w.label?.trim() || `${formatDate(w.from)} – ${formatDate(w.to)}`;

const buildTripCard = (digest: TripEmailDigest): string => {
    const { window: w, hits } = digest;
    const shown = hits.slice(0, TRIP_MAX_EMAIL_HITS);
    const hidden = hits.length - shown.length;

    const rows = shown
        .map((h) => {
            const link = buildReservationLink(h.siteId, h.run.from, h.run.nights);
            const star = h.tier === "favorites" ? "&#9733; " : h.tier === "worthwhile" ? "&#9671; " : "";
            const dates = `${formatDate(h.run.from)} &rarr; ${formatDate(h.run.to)} &middot; ${h.run.nights} ${h.run.nights === 1 ? "night" : "nights"}`;
            return `
                                        <tr>
                                            <td style="padding:10px 16px 0 16px;">
                                                <div style="font-family:${F.ital};font-style:italic;font-size:18px;line-height:24px;color:${C.ink};">${star}${h.campgroundName} &middot; Site ${h.siteName.replace(/^Site\s+/i, "")}</div>
                                                <div style="font-family:${F.body};font-weight:bold;font-size:14px;line-height:20px;color:${C.ink};margin-top:2px;">${dates}</div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:8px 16px 4px 16px;">
                                                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${C.forest}" align="center" style="background-color:${C.forest};">
                                                                <a href="${link}" style="display:block;padding:11px 12px;font-family:${F.poster};font-weight:800;font-size:13px;color:${C.cream};text-decoration:none;letter-spacing:0.10em;text-transform:uppercase;text-align:center;">Book on recreation.gov &rarr;</a>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>`;
        })
        .join("");

    const hiddenRow =
        hidden > 0
            ? `
                                        <tr>
                                            <td style="padding:6px 16px 4px 16px;">
                                                <div style="font-family:${F.ital};font-style:italic;font-size:14px;color:${C.inkSoft};">+ ${hidden} more site${hidden === 1 ? "" : "s"} for this window on your dashboard</div>
                                            </td>
                                        </tr>`
            : "";

    return `
                        <tr>
                            <td style="padding-bottom:10px;">
                                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.cream};border:1.5px solid ${C.ink};border-collapse:separate;">
                                    <tbody>
                                        <tr>
                                            <td style="padding:14px 16px 0 16px;">
                                                <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
                                                    <tbody>
                                                        <tr>
                                                            <td bgcolor="${C.clay}" style="background-color:${C.clay};font-family:${F.mono};font-size:12px;color:${C.cream};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;padding:4px 8px;">Trip match &middot; ${hits.length} site${hits.length === 1 ? "" : "s"}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <div style="font-family:${F.poster};font-weight:900;font-size:20px;line-height:24px;color:${C.ink};text-transform:uppercase;">${tripWindowLabel(w)}</div>
                                                <div style="font-family:${F.mono};font-weight:700;font-size:12px;color:${C.inkSubtle};letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">${formatDate(w.from)} &rarr; ${formatDate(w.to)}${w.flexDays ? ` &middot; &plusmn;${w.flexDays}d` : ""}</div>
                                            </td>
                                        </tr>
                                        ${rows}
                                        ${hiddenRow}
                                        <tr><td style="padding-bottom:12px;"></td></tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>`;
};

const buildTripSection = (digests: TripEmailDigest[]): string => {
    const cards = digests.map(buildTripCard).join("");
    return `
        <tr>
            <td bgcolor="${C.paper}" style="background-color:${C.paper};padding:28px 18px 6px 18px;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                    <tbody>
                        <tr>
                            <td style="padding-bottom:8px;">
                                <div style="font-family:${F.mono};font-weight:700;font-size:13px;color:${C.clay};letter-spacing:0.18em;text-transform:uppercase;">&sect; Trip match</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-bottom:14px;">
                                <div style="font-family:${F.ital};font-style:italic;font-size:16px;line-height:22px;color:${C.inkSoft};">Sites that can host your trip dates: the ones you asked us to hunt for.</div>
                            </td>
                        </tr>
                        ${cards}
                    </tbody>
                </table>
            </td>
        </tr>`;
};
```

In `formatEmail`:

1. `const tripDigests = options.tripDigests ?? [];` near the other option reads.
2. Subject: put a trips branch FIRST:

```ts
    let subject: string;
    if (tripDigests.length > 0) {
        const d = tripDigests[0]!;
        const totalSites = tripDigests.reduce((n, t) => n + t.hits.length, 0);
        subject =
            `Trip match: ${tripWindowLabel(d.window)} · ${totalSites} site${totalSites === 1 ? "" : "s"}` +
            (tripDigests.length > 1 ? ` (+${tripDigests.length - 1} more windows)` : "");
    } else if (adjacentGroups.length > 0) {
        ...existing...
```

3. Campground names union gains trip campgrounds:

```ts
    const uniqueCampgroundNames = [
        ...new Set([
            ...tripDigests.flatMap((d) => d.hits.map((h) => h.campgroundName)),
            ...newMatches.map((m) => m.campgroundName),
            ...groupCampgroundNames,
        ]),
    ];
```

4. Header count includes trip hits: `const headerCount = count + adjacentGroups.length + tripDigests.reduce((n, d) => n + d.hits.length, 0);`
5. Section: `const tripSection = tripDigests.length > 0 ? buildTripSection(tripDigests) : "";` and render it in the HTML immediately BEFORE `${adjacentSection}` with the comment `<!-- TRIP MATCHES: featured above everything -->`.
6. Preheader: `${buildPreheader(newMatches, tripDigests.length > 0 ? buildTripPreheaderText(tripDigests) : undefined)}`.

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd notifier && npm test -- email && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Format + commit**

```bash
cd notifier && npm run format
git add -A && git commit -m "Email formatter: featured trip-match section, subject, preheader"
```

---

### Task 6: Notifier pure functions: trips diff, dupe suppression, push digests

**Files:**
- Modify: `notifier/check.ts` (types + 3 exported pure functions; no run() wiring yet)
- Test: `notifier/trip-notify.test.ts` (new)

**Interfaces:**
- Consumes: `TRIP_COOLDOWN_MS` (Task 3), `TripSiteHit` (Task 1), `formatDate`/`buildReservationLink` (email.ts), existing `rangesOverlap`.
- Produces (Task 7 wires these):
  - `NotifierState.trips?: Record<string, Array<{ from: string; to: string; seen: string }>>`
  - `export function diffTripsWithCooldown(hits, priorState, nowMs, cooldownMs?)` returning `{ newHits: TripSiteHit[]; nextTripState: NonNullable<NotifierState["trips"]> }`
  - `export function suppressTripDuplicates(matches: MatchResult[], tripHits: TripSiteHit[]): MatchResult[]`
  - `export interface TripDigest { window: TripWindow; hits: TripSiteHit[]; push: { title: string; body: string; url: string; tag: string } }`
  - `export function buildTripDigests(newHits, windows, siteUrl): TripDigest[]`

- [ ] **Step 1: Write the failing tests**

Create `notifier/trip-notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffTripsWithCooldown, suppressTripDuplicates, buildTripDigests } from "./check";
import type { TripSiteHit } from "../next/src/lib/trip-windows";
import type { TripWindow } from "../next/src/types/campground";

const NOW = Date.parse("2026-07-22T18:00:00Z");
const HOURS = 60 * 60 * 1000;

const hit = (over: Partial<TripSiteHit> = {}): TripSiteHit => ({
    windowId: "w1",
    campgroundId: "233563",
    campgroundName: "Point Campground",
    siteId: "111",
    siteName: "A01",
    tier: "favorites",
    run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    ...over,
});

const win: TripWindow = { id: "w1", from: "2026-07-31", to: "2026-08-02", label: "Lake weekend" };

describe("diffTripsWithCooldown", () => {
    it("first sighting fires and is recorded", () => {
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], null, NOW);
        expect(newHits).toHaveLength(1);
        expect(nextTripState["w1:233563:111"]).toHaveLength(1);
    });

    it("an overlapping run within the cooldown does not re-fire", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 2 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(0);
        // The prior seen is PRESERVED (not refreshed), so it can age out and re-fire.
        expect(nextTripState["w1:233563:111"]![0]!.seen).toBe(new Date(NOW - 2 * HOURS).toISOString());
    });

    it("re-fires once the prior range ages past the 6h cooldown", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 7 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(1);
    });

    it("keys are independent per window and site", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 1 * HOURS).toISOString() },
                ],
            },
        };
        const other = hit({ siteId: "222", siteName: "B02" });
        const { newHits } = diffTripsWithCooldown([hit(), other], prior, NOW);
        expect(newHits.map((h) => h.siteId)).toEqual(["222"]);
    });
});

describe("suppressTripDuplicates", () => {
    const match = {
        campgroundId: "233563",
        campgroundName: "Point Campground",
        campgroundArea: "",
        campgroundDescription: "",
        siteId: "111",
        siteName: "A01",
        group: "favorites",
        match: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    } as never;
    it("drops normal matches covered by a trip hit this run", () => {
        expect(suppressTripDuplicates([match], [hit()])).toEqual([]);
    });
    it("keeps non-overlapping matches", () => {
        const sept = { ...match, match: { from: "2026-09-04", to: "2026-09-06", nights: 2 } } as never;
        expect(suppressTripDuplicates([sept], [hit()])).toHaveLength(1);
    });
});

describe("buildTripDigests", () => {
    it("one digest per window, favorites first, capped body, sole-hit deep link", () => {
        const digests = buildTripDigests([hit()], [win], "https://campwatch.dev");
        expect(digests).toHaveLength(1);
        expect(digests[0]!.push.title).toBe("Trip match: Lake weekend");
        expect(digests[0]!.push.tag).toBe("cw-trip-w1");
        expect(digests[0]!.push.url).toContain("/camping/campsites/111?");
        expect(digests[0]!.push.body).toContain("★ Point Campground · A01");
    });
    it("multi-campground digest links to the dashboard", () => {
        const hits = [hit(), hit({ campgroundId: "999", campgroundName: "Other", siteId: "9", siteName: "Z9", tier: "all-others" })];
        const digests = buildTripDigests(hits, [win], "https://campwatch.dev");
        expect(digests[0]!.push.url).toBe("https://campwatch.dev/app");
    });
    it("returns nothing for windows with no hits", () => {
        expect(buildTripDigests([], [win], "")).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd notifier && npm test -- trip-notify`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement in check.ts**

Imports (top of file):

```ts
import { tripHitsForCampground, type TripSiteHit } from "../next/src/lib/trip-windows";
import { TRIP_COOLDOWN_MS } from "../next/src/lib/notifier-state-merge";
import type { TripWindow } from "../next/src/types/campground";
```

Add to `NotifierState` (after `groups`):

```ts
    /** trip key ("windowId:campgroundId:siteId") -> alerted runs with last-ALERT ISO.
     *  6h cooldown (TRIP_COOLDOWN_MS): the age-out IS the re-alert cadence, so
     *  `seen` is stamped only when a hit actually fires, never refreshed on sight. */
    trips?: Record<string, Array<{ from: string; to: string; seen: string }>>;
```

Hoist the push-line constants out of run() so buildTripDigests can share them (delete the inline `const PUSH_MAX_LINES = 5;` and `tierMark` inside run(), define at module level near `COOLDOWN_MS`):

```ts
const PUSH_MAX_LINES = 5;
// Tier marker matching the app/email legend: ★ favorite, ◇ worthwhile.
const tierMark = (t: string) => (t === "favorites" ? "★ " : t === "worthwhile" ? "◇ " : "");
const TIER_ORDER: Record<string, number> = { favorites: 0, worthwhile: 1, "all-others": 2 };
```

Add the three functions after `diffGroupsWithCooldown`:

```ts
// ── Trip-window dedup ─────────────────────────────────────────────────────────

// Same overlap-within-cooldown semantics as diffPerUser, keyed by
// (window, campground, site), with two deliberate differences: the cooldown is
// 6h, and a still-visible non-new run does NOT refresh `seen`. Refreshing would
// keep the range alive forever and kill the every-6h re-alert.
export function diffTripsWithCooldown(
    hits: TripSiteHit[],
    priorState: { trips?: NotifierState["trips"] } | null | undefined,
    nowMs: number,
    cooldownMs: number = TRIP_COOLDOWN_MS,
): { newHits: TripSiteHit[]; nextTripState: NonNullable<NotifierState["trips"]> } {
    const cutoff = nowMs - cooldownMs;
    const seenIso = new Date(nowMs).toISOString();

    const next: NonNullable<NotifierState["trips"]> = {};
    const priorFresh = new Map<string, Array<{ from: string; to: string; seen: string }>>();
    for (const [key, ranges] of Object.entries(priorState?.trips ?? {})) {
        const fresh = ranges.filter((r) => Date.parse(r.seen) > cutoff);
        if (fresh.length) {
            priorFresh.set(key, fresh);
            next[key] = fresh.map((r) => ({ ...r }));
        }
    }

    const newHits: TripSiteHit[] = [];
    for (const h of hits) {
        const key = `${h.windowId}:${h.campgroundId}:${h.siteId}`;
        const prior = priorFresh.get(key) ?? [];
        if (prior.some((r) => rangesOverlap(r.from, r.to, h.run.from, h.run.to))) continue;
        newHits.push(h);
        (next[key] ??= []).push({ from: h.run.from, to: h.run.to, seen: seenIso });
    }
    return { newHits, nextTripState: next };
}

// Same-run dupe suppression: a normal alert whose site+range is already covered
// by a trip digest this cycle would be a duplicate push/email card.
export function suppressTripDuplicates(matches: MatchResult[], tripHits: TripSiteHit[]): MatchResult[] {
    if (tripHits.length === 0) return matches;
    return matches.filter(
        (m) =>
            !tripHits.some(
                (h) =>
                    h.campgroundId === m.campgroundId &&
                    h.siteId === m.siteId &&
                    rangesOverlap(h.run.from, h.run.to, m.match.from, m.match.to),
            ),
    );
}

export interface TripDigest {
    window: TripWindow;
    hits: TripSiteHit[];
    push: { title: string; body: string; url: string; tag: string };
}

// One digest per window that has new hits: distinct title, per-window tag (new
// sends replace the prior notification), deep link to the sole site / sole
// campground / dashboard.
export function buildTripDigests(
    newHits: TripSiteHit[],
    windows: TripWindow[],
    siteUrl: string,
): TripDigest[] {
    if (newHits.length === 0) return [];
    const digests: TripDigest[] = [];
    for (const w of [...windows].sort((a, b) => a.from.localeCompare(b.from))) {
        const hits = newHits
            .filter((h) => h.windowId === w.id)
            .sort(
                (a, b) =>
                    (TIER_ORDER[a.tier] ?? 2) - (TIER_ORDER[b.tier] ?? 2) ||
                    a.campgroundName.localeCompare(b.campgroundName) ||
                    a.siteName.localeCompare(b.siteName),
            );
        if (hits.length === 0) continue;
        const label = w.label?.trim() || `${formatDate(w.from)} – ${formatDate(w.to)}`;
        const lines = hits.map(
            (h) =>
                `${tierMark(h.tier)}${h.campgroundName} · ${h.siteName} · ${formatDate(h.run.from)} → ${formatDate(h.run.to)}`,
        );
        const shown = lines.slice(0, PUSH_MAX_LINES);
        if (lines.length > PUSH_MAX_LINES) shown.push(`+${lines.length - PUSH_MAX_LINES} more`);
        const cgIds = new Set(hits.map((h) => h.campgroundId));
        const sole = hits.length === 1 ? hits[0] : undefined;
        const url = sole
            ? buildReservationLink(sole.siteId, sole.run.from, sole.run.nights)
            : cgIds.size === 1
              ? `https://www.recreation.gov/camping/campgrounds/${hits[0]!.campgroundId}`
              : `${siteUrl || "https://campwatch.dev"}/app`;
        digests.push({
            window: w,
            hits,
            push: { title: `Trip match: ${label}`, body: shown.join("\n"), url, tag: `cw-trip-${w.id}` },
        });
    }
    return digests;
}
```

Note: run() still compiles because the hoisted `PUSH_MAX_LINES`/`tierMark` replace the inline ones. `tripHitsForCampground` import is used in Task 7; if the linter flags it unused, add it in Task 7 instead.

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd notifier && npm test && npm run typecheck`
Expected: ALL notifier tests pass (existing + new), no type errors.

- [ ] **Step 5: Format + commit**

```bash
cd notifier && npm run format
git add -A && git commit -m "Notifier: trips dedup diff, same-run dupe suppression, push digest builder"
```

---

### Task 7: Wire the trip pass into run() + snapshot

**Files:**
- Modify: `notifier/check.ts` (computeMatchesForUser, writeUserSnapshot, run, runTick, runSweep)
- Test: existing `notifier/check.test.ts` suite must stay green; extend `notifier/trip-notify.test.ts` with one integration test modeled on the harness in `notifier/check.test.ts` (read that file first and reuse its fetch-mocking helpers verbatim).

**Interfaces:**
- Consumes: everything from Tasks 1, 4, 5, 6.
- Produces: end-to-end trip alerts. `ComputedUserResults` gains `tripHits: TripSiteHit[]`. `computeMatchesForUser(target, rawByCampground, todayIso)`. `writeUserSnapshot(target, syntheticResults, failedCampgroundIds, tripHitsByCg)`.

- [ ] **Step 1: computeMatchesForUser computes trip hits**

Change the signature and interface:

```ts
interface ComputedUserResults {
    matches: MatchResult[];
    groups: AdjacentGroup[];
    campgroundNamesById: Record<string, string>;
    tripHits: TripSiteHit[];
}

async function computeMatchesForUser(
    target: NotificationTarget,
    rawByCampground: Record<string, unknown[]>,
    todayIso: string,
): Promise<ComputedUserResults> {
```

After the main campground loop (before the `siteConfigurations` block), add:

```ts
    // Trip-window hits: computed from the RAW months directly, so they ignore
    // stay-length/start-day settings, notify scope, blackouts, and the
    // campground watch dates. A disabled campground still opts out entirely.
    const tripHits: TripSiteHit[] = [];
    const tripHitsByCg = new Map<string, TripSiteHit[]>();
    for (const c of target.campgrounds["recreation.gov"] ?? []) {
        if (c.enabled === false) continue;
        const hits = tripHitsForCampground(
            rawByCampground[c.id],
            c,
            target.globalSettings?.tripWindows,
            todayIso,
        );
        if (hits.length === 0) continue;
        tripHits.push(...hits);
        tripHitsByCg.set(c.id, hits);
    }
```

Change the snapshot call to `await writeUserSnapshot(target, syntheticResults, failedCampgroundIds, tripHitsByCg);` and the return to `return { matches: sendable, groups, campgroundNamesById, tripHits };`

- [ ] **Step 2: writeUserSnapshot attaches tripMatches**

Add the 4th parameter `tripHitsByCg: Map<string, TripSiteHit[]>` and change the `campgrounds.push` block:

```ts
        const tripMatches = tripHitsByCg.get(r.campgroundId);
        campgrounds.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
            ...(tripMatches?.length ? { tripMatches } : {}),
        });
```

- [ ] **Step 3: run() wiring**

1. After `const nowMonth = ...` (line ~708) add `const todayIso = now.toISOString().slice(0, 10);` and change the plan line to `const plan = buildNotifyPlan(eligible, nowMonth, todayIso);`
2. Change the compute call to `computedByTarget.set(target, await computeMatchesForUser(target, rawByCampground, todayIso));`
3. In the per-target loop, destructure `tripHits` too:

```ts
        const {
            matches: userMatches,
            groups: userGroups,
            campgroundNamesById,
            tripHits,
        } = computedByTarget.get(target)!;
```

4. After the `diffGroupsWithCooldown` call add:

```ts
        const { newHits: newTripHits, nextTripState } = diffTripsWithCooldown(
            tripHits,
            priorState,
            now.getTime(),
        );
```

and extend the mergedState block:

```ts
        const mergedState: NotifierState = { ...nextState };
        if (Object.keys(nextGroupState).length > 0) mergedState.groups = nextGroupState;
        if (Object.keys(nextTripState).length > 0) mergedState.trips = nextTripState;
```

(First-run seeding needs no extra code: on first run every hit is "new" and lands in `nextTripState`, and the existing first-run branch skips sending.)

5. Change the empty gate to:

```ts
        if (newMatches.length === 0 && newGroups.length === 0 && newTripHits.length === 0) {
```

6. Immediately after the gate, build digests and suppress dupes; use `sendableMatches` everywhere `newMatches` was used for DISPLAY from here down (first-seen stamping loop, the send log line, `sendEmailToUser`, the latency loop, the push `byCg` grouping). Do NOT touch the state handling above.

```ts
        const tripDigests = buildTripDigests(
            newTripHits,
            target.globalSettings?.tripWindows ?? [],
            siteUrl,
        );
        // A normal alert whose site+range a trip digest already covers this run
        // would be a duplicate card/push line.
        const sendableMatches = suppressTripDuplicates(newMatches, newTripHits);
```

Update the log lines to include trips, e.g.:

```ts
        console.log(
            `[${target.email}] ${sendableMatches.length} new match(es), ${newGroups.length} new group(s), ${newTripHits.length} trip hit(s), sending email`,
        );
```

7. `sendEmailToUser`: add `tripDigests` to its args object type (`tripDigests?: TripDigest[]`) and pass through to `formatEmail` options as `...(tripDigests && tripDigests.length > 0 ? { tripDigests } : {})`. Call it with `matches: sendableMatches, groups: newGroups, tripDigests`.
8. Push block: move `const dead: string[] = [];` and `let pushSent = 0;` ABOVE the trip loop, then insert the trip digest sends BEFORE the per-campground `byCg` loop:

```ts
                    // Trip digests first: one push per window, its own tag so a
                    // new send replaces the prior notification for that window.
                    for (const d of tripDigests) {
                        for (const sub of target.pushSubscriptions ?? []) {
                            try {
                                const r = await sendWebPush(sub, d.push, config.vapid);
                                if (r.gone) {
                                    if (!dead.includes(sub.endpoint)) dead.push(sub.endpoint);
                                } else if (r.status >= 200 && r.status < 300) {
                                    pushSent++;
                                }
                            } catch (err) {
                                console.error(`[push] ${target.email}: ${(err as Error).message}`);
                            }
                        }
                    }
```

The `byCg` grouping loop switches from `newMatches` to `sendableMatches`. The final push log condition becomes `if (byCg.size > 0 || tripDigests.length > 0)`.

9. `runTick`: `const fastLane = buildFastLanePlan(targets, nowMonth, config.now.toISOString().slice(0, 10));`
   `runSweep`: `const plan = buildSweepPlan(targets, minute, nowMonth, config.now.toISOString().slice(0, 10));`

- [ ] **Step 4: Integration test**

Read `notifier/check.test.ts` first. Reuse its run()-level harness (mock `globalThis.fetch` for notification-targets / first-seen / notifier-state / recent / stats, and the Resend POST) to add ONE test to `notifier/trip-notify.test.ts`: a target with one campground (normal settings that produce zero normal matches, e.g. `stayLengths: [7]`), a KV stub whose raw month has a site open exactly Fri+Sat, a trip window over that weekend, `notifierState: {}` (NOT null, so it isn't treated as first run). Assert:
- the Resend POST body's subject starts with `Trip match:`
- the notifier-state PUT body contains `state.trips` with key `w1:<cgId>:<siteId>`
- run again with the returned state and 2h later `now`: no second Resend POST (cooldown holds).

- [ ] **Step 5: Run the full notifier suite**

Run: `cd notifier && npm test && npm run typecheck`
Expected: ALL pass. Pay attention to existing `check.test.ts` and `cooldown-dedup.test.ts` regressions (computeMatchesForUser signature change may require updating their call sites in tests; update the TESTS' call arguments, adding `"2026-01-01"`-style todayIso, without changing assertions).

- [ ] **Step 6: Format + commit**

```bash
cd notifier && npm run format
git add -A && git commit -m "Notifier: trip-match pass wired into run(), snapshot tripMatches, fast-lane todayIso"
```

---

### Task 8: Availability route computes tripMatches for the dashboard

**Files:**
- Modify: `next/src/app/api/availability/route.ts`
- Test: `next/src/app/api/availability/route.test.ts` (extend)

**Interfaces:**
- Consumes: `activeWindowsFor`, `addDaysIso`, `tripHitsForCampground` (Task 1).
- Produces: snapshot campgrounds carry `tripMatches?: TripSiteHit[]` (already typed in Task 1). Trip-window months are fetched even outside the campground watch dates.

- [ ] **Step 1: Write the failing test**

Append to `route.test.ts` (reuse `createMockKv` + mocks already in the file):

```ts
    it("attaches tripMatches when a window is covered", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Test CG",
                        enabled: true,
                        dates: { startDate: "2100-07-01", endDate: "2100-07-31" },
                        sites: { favorites: ["001"], worthwhile: [] },
                    },
                ],
            },
            globalSettings: {
                stayLengths: [7],
                validStartDays: ["Monday"],
                tripWindows: [{ id: "w1", from: "2100-07-10", to: "2100-07-12" }],
            },
            updatedAt: "2026-05-01T00:00:00Z",
        } as never);
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: {
                        "1": {
                            site: "001",
                            campsite_type: "STANDARD",
                            availabilities: {
                                "2100-07-10T00:00:00Z": "Available",
                                "2100-07-11T00:00:00Z": "Available",
                            },
                        },
                    },
                }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        const body = (await response.json()) as {
            campgrounds: Array<{ tripMatches?: Array<{ windowId: string; siteId: string }> }>;
        };
        expect(body.campgrounds[0]?.tripMatches).toHaveLength(1);
        expect(body.campgrounds[0]?.tripMatches?.[0]).toMatchObject({ windowId: "w1", siteId: "1" });
    });
```

(Note: stayLengths [7] + Monday starts means the normal pipeline produces zero matches for a 2-night Fri window; only the trip path can surface this site. The campground still needs a `matches`-bearing site for `sitesWithMatches`, but `tripMatches` attaches regardless because it's independent of that map.)

- [ ] **Step 2: Run test, verify it fails**

Run: `cd next && pnpm vitest run src/app/api/availability/route.test.ts`
Expected: new test FAILS (`tripMatches` undefined).

- [ ] **Step 3: Implement**

In `route.ts` add the import:

```ts
import { activeWindowsFor, addDaysIso, tripHitsForCampground } from "@/lib/trip-windows";
```

In `buildSnapshot`, replace the months computation (lines ~56-58) with:

```ts
        const nowMonth = new Date().toISOString().slice(0, 7);
        const todayIso = new Date().toISOString().slice(0, 10);
        const tripWins = activeWindowsFor(config.globalSettings.tripWindows, cg.id, todayIso);
        const monthSet = new Set(monthsBetween(start, end).filter((m) => m >= nowMonth));
        for (const w of tripWins) {
            for (const m of monthsBetween(w.from, addDaysIso(w.to, -1))) {
                if (m >= nowMonth) monthSet.add(m);
            }
        }
        const months = [...monthSet];
        if (months.length === 0) continue;
```

After the adjacency block (before `results.push`), add:

```ts
        const tripMatches = tripHitsForCampground(
            rawResults,
            cg,
            config.globalSettings.tripWindows,
            todayIso,
        );
```

and extend the push:

```ts
        results.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
            ...(adjacentGroups ? { adjacentGroups } : {}),
            ...(tripMatches.length > 0 ? { tripMatches } : {}),
        });
```

Known limitation (documented in the spec): a campground with NO watch dates is still skipped by buildSnapshot, so the dashboard badge misses it; the notifier does cover it. Acceptable, all real campgrounds have dates.

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd next && pnpm vitest run src/app/api/availability/route.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Availability snapshot: fetch trip-window months and attach tripMatches"
```

---

### Task 9: Trips card on the dashboard

**Files:**
- Create: `next/src/components/dashboard/trips-card/trips-card.tsx`
- Modify: `next/src/app/app/page.tsx`
- Test: `next/src/components/dashboard/trips-card/trips-card.test.tsx`

**Interfaces:**
- Consumes: `TripWindow`, `ProcessedCampground.tripMatches`, `useUserCampgrounds().save`, `toLocalIso` from `@/components/dashboard/helpers`, shadcn `Button`/`Calendar`/`Popover`, `diffDays`/`windowIsPast`/`TRIP_MAX_*` from the lib.
- Produces: `<TripsCard tripWindows campgrounds campgroundsByAreas onChange isMobile />` and exported `weekendWindow(offsetWeeks, now?)`.

- [ ] **Step 1: Write the failing test**

Create `trips-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripsCard, weekendWindow } from "./trips-card";
import type { TripWindow, ProcessedCampground } from "@/types/campground";

const win: TripWindow = { id: "w1", from: "2100-07-31", to: "2100-08-02", label: "Lake weekend" };
const cgWithHit = {
    id: "233563",
    name: "Point",
    sites: { favorites: [], worthwhile: [] },
    siteAvailability: {},
    tripMatches: [
        {
            windowId: "w1",
            campgroundId: "233563",
            campgroundName: "Point",
            siteId: "111",
            siteName: "A01",
            tier: "favorites",
            run: { from: "2100-07-31", to: "2100-08-02", nights: 2 },
        },
    ],
} as unknown as ProcessedCampground;

describe("weekendWindow", () => {
    it("Wednesday resolves to the coming Fri->Sun", () => {
        expect(weekendWindow(0, new Date("2026-07-22T12:00:00"))).toEqual({
            from: "2026-07-24",
            to: "2026-07-26",
        });
    });
    it("Saturday clamps arrival to today", () => {
        expect(weekendWindow(0, new Date("2026-07-25T12:00:00"))).toEqual({
            from: "2026-07-25",
            to: "2026-07-26",
        });
    });
    it("next weekend adds seven days", () => {
        expect(weekendWindow(1, new Date("2026-07-22T12:00:00"))).toEqual({
            from: "2026-07-31",
            to: "2026-08-02",
        });
    });
});

describe("TripsCard", () => {
    it("renders windows with live match counts", () => {
        render(
            <TripsCard
                tripWindows={[win]}
                campgrounds={[]}
                campgroundsByAreas={[cgWithHit]}
                onChange={vi.fn()}
                isMobile={false}
            />,
        );
        expect(screen.getByText("Lake weekend")).toBeTruthy();
        expect(screen.getByText(/1 site matches now/i)).toBeTruthy();
    });

    it("delete calls onChange without the window", () => {
        const onChange = vi.fn();
        render(
            <TripsCard
                tripWindows={[win]}
                campgrounds={[]}
                campgroundsByAreas={[]}
                onChange={onChange}
                isMobile={false}
            />,
        );
        fireEvent.click(screen.getByLabelText("Remove trip"));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("quick-add chip adds a weekend window", () => {
        const onChange = vi.fn();
        render(
            <TripsCard
                tripWindows={[]}
                campgrounds={[]}
                campgroundsByAreas={[]}
                onChange={onChange}
                isMobile={false}
            />,
        );
        fireEvent.click(screen.getByText("This weekend"));
        const arg = onChange.mock.calls[0]![0] as TripWindow[];
        expect(arg).toHaveLength(1);
        expect(arg[0]!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(arg[0]!.to > arg[0]!.from).toBe(true);
    });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd next && pnpm vitest run src/components/dashboard/trips-card`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the component**

Create `trips-card.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toLocalIso } from "@/components/dashboard/helpers";
import {
    diffDays,
    windowIsPast,
    TRIP_MAX_FLEX_DAYS,
    TRIP_MAX_LABEL,
    TRIP_MAX_WINDOWS,
    type TripSiteHit,
} from "@/lib/trip-windows";
import type { Campground, ProcessedCampground, TripWindow } from "@/types/campground";

interface TripsCardProps {
    tripWindows: TripWindow[];
    /** Watched campgrounds, for the optional per-window filter. */
    campgrounds: Campground[];
    /** Live availability (server-computed tripMatches ride on these). */
    campgroundsByAreas: ProcessedCampground[];
    onChange: (next: TripWindow[]) => void;
    isMobile: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtIso = (iso: string) => DATE_FMT.format(new Date(iso + "T00:00:00"));

/** Fri->Sun of this (or next) weekend, arrival clamped to today. Exported for tests. */
export function weekendWindow(offsetWeeks: 0 | 1, now: Date = new Date()): { from: string; to: string } {
    const dow = now.getDay();
    // Anchor on the weekend's Friday: Fri = today, Sat = yesterday, else the coming Friday.
    const delta = dow === 5 ? 0 : dow === 6 ? -1 : 5 - dow;
    const friday = new Date(now);
    friday.setDate(now.getDate() + delta + offsetWeeks * 7);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    const todayIso = toLocalIso(now);
    const fromIso = toLocalIso(friday);
    return { from: fromIso < todayIso ? todayIso : fromIso, to: toLocalIso(sunday) };
}

const reservationLink = (h: TripSiteHit) =>
    `https://www.recreation.gov/camping/campsites/${h.siteId}?arrivalDate=${h.run.from}&departureDate=${h.run.to}`;

export function TripsCard({ tripWindows, campgrounds, campgroundsByAreas, onChange, isMobile }: TripsCardProps) {
    const [adding, setAdding] = useState(false);
    const [range, setRange] = useState<DateRange | undefined>();
    const [label, setLabel] = useState("");
    const [flex, setFlex] = useState(0);
    const [cgFilter, setCgFilter] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const todayIso = toLocalIso(new Date());

    const hitsByWindow = useMemo(() => {
        const map = new Map<string, TripSiteHit[]>();
        for (const cg of campgroundsByAreas) {
            for (const h of cg.tripMatches ?? []) {
                const list = map.get(h.windowId);
                if (list) list.push(h);
                else map.set(h.windowId, [h]);
            }
        }
        return map;
    }, [campgroundsByAreas]);

    const rangeValid = Boolean(range?.from && range?.to && toLocalIso(range.from) < toLocalIso(range.to));
    const nights = rangeValid ? diffDays(toLocalIso(range!.from!), toLocalIso(range!.to!)) : 0;
    const maxFlex = rangeValid ? Math.min(TRIP_MAX_FLEX_DAYS, Math.floor((nights - 1) / 2)) : 0;

    const resetForm = () => {
        setAdding(false);
        setRange(undefined);
        setLabel("");
        setFlex(0);
        setCgFilter(new Set());
    };

    const commitAdd = () => {
        if (!rangeValid) return;
        const w: TripWindow = {
            id: crypto.randomUUID(),
            from: toLocalIso(range!.from!),
            to: toLocalIso(range!.to!),
            ...(label.trim() ? { label: label.trim().slice(0, TRIP_MAX_LABEL) } : {}),
            ...(flex > 0 ? { flexDays: Math.min(flex, maxFlex) } : {}),
            ...(cgFilter.size > 0 ? { campgroundIds: [...cgFilter] } : {}),
        };
        onChange([...tripWindows, w]);
        resetForm();
    };

    const quickAdd = (offset: 0 | 1) => {
        const { from, to } = weekendWindow(offset);
        if (tripWindows.some((w) => w.from === from && w.to === to)) return;
        onChange([
            ...tripWindows,
            { id: crypto.randomUUID(), from, to, label: offset === 0 ? "This weekend" : "Next weekend" },
        ]);
    };

    const remove = (id: string) => onChange(tripWindows.filter((w) => w.id !== id));

    const toggleExpanded = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const atCap = tripWindows.length >= TRIP_MAX_WINDOWS;

    return (
        <section className="px-[22px] py-3 md:px-9">
            <div className="rounded-lg border border-cw-rule bg-cw-cream/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CalendarDays className="size-4 shrink-0 text-cw-clay" aria-hidden />
                    <h2 className="font-poster text-[15px] font-extrabold uppercase tracking-[0.08em]">
                        Trips
                    </h2>
                    <span className="font-italic-serif text-[13px] italic text-cw-ink-soft">
                        dates you're hunting for
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={atCap} onClick={() => quickAdd(0)}>
                            This weekend
                        </Button>
                        <Button size="sm" variant="outline" disabled={atCap} onClick={() => quickAdd(1)}>
                            Next weekend
                        </Button>
                        <Button size="sm" disabled={atCap} onClick={() => setAdding((v) => !v)}>
                            <Plus className="size-4" /> Add dates
                        </Button>
                    </div>
                </div>

                {adding && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-cw-rule-soft pt-3">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {rangeValid
                                        ? `${fmtIso(toLocalIso(range!.from!))} → ${fmtIso(toLocalIso(range!.to!))}`
                                        : "Arrival → departure"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="range"
                                    resetOnSelect
                                    selected={range}
                                    onSelect={setRange}
                                    numberOfMonths={isMobile ? 1 : 2}
                                />
                            </PopoverContent>
                        </Popover>
                        <label className="flex flex-col gap-1 font-mono-field text-[11px] uppercase tracking-[0.1em] text-cw-ink-soft">
                            Label
                            <input
                                className="rounded border border-cw-rule bg-white px-2 py-1 font-body-serif text-sm normal-case tracking-normal"
                                value={label}
                                maxLength={TRIP_MAX_LABEL}
                                placeholder="Lake weekend"
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </label>
                        <label className="flex flex-col gap-1 font-mono-field text-[11px] uppercase tracking-[0.1em] text-cw-ink-soft">
                            Flex ±days
                            <select
                                className="rounded border border-cw-rule bg-white px-2 py-1 text-sm"
                                value={Math.min(flex, maxFlex)}
                                onChange={(e) => setFlex(Number(e.target.value))}
                                disabled={maxFlex === 0}
                            >
                                {Array.from({ length: maxFlex + 1 }, (_, i) => (
                                    <option key={i} value={i}>
                                        ±{i}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {campgrounds.length > 0 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        {cgFilter.size === 0 ? "All campgrounds" : `${cgFilter.size} campground${cgFilter.size === 1 ? "" : "s"}`}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="max-h-64 w-64 overflow-y-auto p-2" align="start">
                                    {campgrounds.map((cg) => (
                                        <label key={cg.id} className="flex items-center gap-2 py-1 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={cgFilter.has(cg.id)}
                                                onChange={(e) =>
                                                    setCgFilter((prev) => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) next.add(cg.id);
                                                        else next.delete(cg.id);
                                                        return next;
                                                    })
                                                }
                                            />
                                            <span className="min-w-0 truncate">{cg.name}</span>
                                        </label>
                                    ))}
                                </PopoverContent>
                            </Popover>
                        )}
                        <div className="flex gap-2">
                            <Button size="sm" disabled={!rangeValid} onClick={commitAdd}>
                                Save trip
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetForm}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {tripWindows.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                        {tripWindows.map((w) => {
                            const hits = hitsByWindow.get(w.id) ?? [];
                            const past = windowIsPast(w, todayIso);
                            const isOpen = expanded.has(w.id);
                            return (
                                <li
                                    key={w.id}
                                    className={`rounded border border-cw-rule bg-white/60 px-3 py-2 ${past ? "opacity-50" : ""}`}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-body-serif text-sm font-bold">
                                            {w.label ?? `${fmtIso(w.from)} → ${fmtIso(w.to)}`}
                                        </span>
                                        <span className="font-mono-field text-[12px] text-cw-ink-soft">
                                            {fmtIso(w.from)} → {fmtIso(w.to)}
                                            {w.flexDays ? ` · ±${w.flexDays}d` : ""}
                                            {w.campgroundIds?.length
                                                ? ` · ${w.campgroundIds.length} campground${w.campgroundIds.length === 1 ? "" : "s"}`
                                                : ""}
                                        </span>
                                        {past ? (
                                            <span className="font-mono-field text-[11px] uppercase text-cw-ink-faint">
                                                Past
                                            </span>
                                        ) : hits.length > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(w.id)}
                                                className="flex cursor-pointer items-center gap-1 rounded bg-cw-forest px-2 py-0.5 font-mono-field text-[11px] font-bold uppercase tracking-[0.08em] text-cw-cream"
                                            >
                                                {hits.length} site{hits.length === 1 ? "" : "s"} match
                                                {hits.length === 1 ? "es" : ""} now
                                                {isOpen ? (
                                                    <ChevronUp className="size-3" />
                                                ) : (
                                                    <ChevronDown className="size-3" />
                                                )}
                                            </button>
                                        ) : (
                                            <span className="font-mono-field text-[11px] uppercase text-cw-ink-faint">
                                                Watching
                                            </span>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="ml-auto"
                                            aria-label="Remove trip"
                                            onClick={() => remove(w.id)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                    {isOpen && hits.length > 0 && (
                                        <ul className="mt-2 flex flex-col gap-1 border-t border-cw-rule-soft pt-2">
                                            {hits.map((h) => (
                                                <li
                                                    key={`${h.campgroundId}:${h.siteId}`}
                                                    className="flex flex-wrap items-center gap-2 text-sm"
                                                >
                                                    <span>
                                                        {h.tier === "favorites" ? "★ " : h.tier === "worthwhile" ? "◇ " : ""}
                                                        {h.campgroundName} · {h.siteName}
                                                    </span>
                                                    <span className="font-mono-field text-[12px] text-cw-ink-soft">
                                                        {fmtIso(h.run.from)} → {fmtIso(h.run.to)} · {h.run.nights}n
                                                    </span>
                                                    <a
                                                        className="ml-auto font-mono-field text-[12px] font-bold uppercase text-cw-forest underline"
                                                        href={reservationLink(h)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Book →
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
```

If a `cw-*` Tailwind class used above doesn't exist in this project's tokens (check `globals.css` / existing usage like `bg-cw-paper`, `text-cw-ink`), substitute the nearest existing one; do not invent new tokens.

- [ ] **Step 4: Wire into the dashboard page**

In `next/src/app/app/page.tsx`:

```tsx
import { TripsCard } from "@/components/dashboard/trips-card/trips-card";
import type { TripWindow } from "@/types/campground";
```

Add the handler next to `handleRatingChange`:

```tsx
    const handleTripWindowsChange = useCallback(
        (next: TripWindow[]) => {
            void save(siteConfig, { ...globalSettings, tripWindows: next });
        },
        [siteConfig, globalSettings, save],
    );
```

Render between the `Greeting` and `WatchlistSection` error boundaries:

```tsx
                                    <DashboardErrorBoundary section="Trips">
                                        <TripsCard
                                            tripWindows={globalSettings.tripWindows ?? []}
                                            campgrounds={siteConfig["recreation.gov"] ?? []}
                                            campgroundsByAreas={campgroundsByAreas}
                                            onChange={handleTripWindowsChange}
                                            isMobile={isMobile}
                                        />
                                    </DashboardErrorBoundary>
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd next && pnpm vitest run src/components/dashboard/trips-card && pnpm tsc --noEmit`
Expected: PASS (no NEW tsc errors beyond the 2 template.ts baseline).

- [ ] **Step 6: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Dashboard Trips card: manage windows, live match badge, weekend quick-add"
```

---

### Task 10: Timeline tint for trip windows

**Files:**
- Modify: `next/src/contexts/site-settings.tsx`, `next/src/app/app/page.tsx` (settings memo)
- Modify: `next/src/components/dashboard/timeline/timeline-track.tsx`
- Modify: `next/src/components/dashboard/timeline/availability-timeline.tsx`, `campground-timeline-row.tsx`, `mobile-timeline.tsx` (prop threading, mirror `blackoutDates` exactly)
- Test: extend `next/src/components/dashboard/timeline/timeline.test.tsx`

**Interfaces:**
- Consumes: `isNightInAnyWindow` (Task 1), `SiteSettingsValue`.
- Produces: `SiteSettingsValue.dates.tripWindows?: TripWindow[]`; `TimelineTrack` prop `tripWindows?: TripWindow[]` rendering a per-night background tint.

- [ ] **Step 1: Context + page settings**

`site-settings.tsx`: add to `SiteSettingsValue["dates"]`:

```ts
        tripWindows?: TripWindow[];
```

with `import type { BlackoutRange, TripWindow } from "@/types/campground";`

`page.tsx` settings memo: add `tripWindows: globalSettings.tripWindows,` beside `blackoutDates`.

- [ ] **Step 2: Failing test**

`timeline.test.tsx` already passes `blackoutDates` through a settings fixture (line ~122). Add a sibling test: render the timeline with `dates: { ..., tripWindows: [{ id: "w1", from: <a night in the horizon>, to: <two days later> }] }` and assert the track contains an element with `data-testid="trip-tint"` (the implementation below adds that attribute). Match the file's existing render/fixture helpers.

Run: `cd next && pnpm vitest run src/components/dashboard/timeline`
Expected: new test FAILS.

- [ ] **Step 3: Implement**

`timeline-track.tsx`: add to props `tripWindows?: TripWindow[];` (import `TripWindow` type and `isNightInAnyWindow`, `toLocalIso` from `@/components/dashboard/helpers`). Inside the component, after `weekendCols`:

```ts
    // Trip-window tint columns: one per night inside any window.
    const tripCols: number[] = [];
    if (tripWindows?.length) {
        for (let i = 0; i < horizon.totalDays; i++) {
            if (isNightInAnyWindow(toLocalIso(dateAt(horizon, i)), tripWindows)) tripCols.push(i);
        }
    }
```

Render BEFORE the weekend shading block:

```tsx
                {/* trip-window tint */}
                {tripCols.map((i) => (
                    <div
                        key={`trip-${i}`}
                        data-testid="trip-tint"
                        className="absolute top-0 bottom-0"
                        style={{
                            left: `${pct(horizon, i)}%`,
                            width: `${pct(horizon, 1)}%`,
                            background: "color-mix(in srgb, var(--cw-forest) 9%, transparent)",
                        }}
                    />
                ))}
```

Thread the prop: grep `blackoutDates` in `components/dashboard/timeline/` and, at every site where it is read from `useSiteSettings()` or passed as a prop toward `TimelineTrack`, mirror an identical `tripWindows` read/prop (`availability-timeline.tsx`, `campground-timeline-row.tsx`, `mobile-timeline.tsx` incl. its `DetailScreen`). Do NOT thread into `AvailabilityBlock` (blocks sit above the tint; no per-block change needed).

- [ ] **Step 4: Run tests, verify pass**

Run: `cd next && pnpm vitest run src/components/dashboard/timeline && pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Format + commit**

```bash
cd next && pnpm format
git add -A && git commit -m "Tint trip-window nights on the availability timelines"
```

---

### Task 11: Full verification

- [ ] **Step 1: Full test suites**

```bash
cd next && pnpm vitest run && pnpm tsc --noEmit && pnpm lint && pnpm format:check
cd ../notifier && npm test && npm run typecheck && npm run format:check
```
Expected: all green (tsc baseline: only the 2 pre-existing template.ts errors).

- [ ] **Step 2: End-to-end dev-server pass**

Use the `Code/campwatch/next:verify` skill (local dev server) to:
1. Load `/app`, confirm the Trips card renders.
2. Quick-add "This weekend"; confirm the save toast, the window row, and (if any watched campground has weekend openings) a "N sites match now" badge whose expanded links point at rec.gov with the right arrival/departure params.
3. Add a custom window with flex ±1 over known availability; confirm badge parity with the timeline.
4. Confirm timeline tint columns under the window dates.
5. Delete a window; confirm it disappears and the record saves.

- [ ] **Step 3: Notifier dry-run sanity (optional but cheap)**

`cd notifier && npm run check -- --dry-run` (the CLI path) with real creds if configured locally; confirm `[Notify]` plan includes trip months and no crashes. Skip if creds aren't set up locally.

- [ ] **Step 4: Commit any stragglers; report status to Mike**

Deploy notes (for after Mike approves): merging/pushing `trip-windows` to `main` auto-deploys both workers (deploy-next.yml). Notifier tests are not in CI, so step 1 here is the gate. After deploy, QA live by adding a real window for the upcoming weekend and waiting a tick, or temporarily pointing a window at a campground with known availability; push arrives per device via the existing subscription.
