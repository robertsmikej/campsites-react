# Ideal Summer Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/app/plan` dashboard feature that turns the user's live availability into a suggested ~5-trip "ideal summer" itinerary (distinct campgrounds, spread Jun–Sep, favorites/weekend-biased) with book links and regenerate/lock/swap controls.

**Architecture:** A pure, unit-tested planner core (`lib/summer-planner.ts`) builds candidate trips from the already-loaded availability snapshot and runs a deterministic greedy slot-fill. A thin client page (`/app/plan`) reuses the dashboard's hooks for data and renders a Field Notes itinerary (summary + reused timeline strip + trip cards). No new backend.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (`cw-*` tokens + `font-*` roles), Vitest + happy-dom + @testing-library/react. Reuses `next/src/lib/timeline.ts` helpers and timeline components.

**Spec:** `docs/superpowers/specs/2026-06-05-summer-planner-design.md` (read it).

---

## Existing code to reuse

- `next/src/lib/timeline.ts`: `buildHorizon(start,end)`, `siteTier(cg, siteName) → "fav"|"worth"|"other"`, `Tier`, `isWeekendNight(date)`, `dateAt(h,i)`, `dowRangeLabel(h,s,e)`, `siteRangeUrl(siteId,h,run)`. Components: `TimelineAxis`, `TimelineTrack`, `AvailabilityBlock` (`components/dashboard/timeline/`).
- `next/src/components/dashboard/helpers.ts`: `toLocalIso(date)`.
- `next/src/components/field-notes/cw-tokens.ts`: `CW` (colors).
- Hooks: `next/src/hooks/use-user-campgrounds.ts` (`siteConfig`, `isHydrating`), `next/src/hooks/use-campgrounds-data.ts` (`useCampgroundsData({enabled, siteConfig}) → { campgroundsByAreas, isFetching }`), `next/src/hooks/use-is-mobile.ts`.
- Types: `ProcessedCampground` (`siteAvailability: Record<siteId, SiteAvailability>`, each `SiteAvailability.matches: StayMatch[]` with `{from,to,nights}`; `sites.favorites/worthwhile`, `id`, `name`, `area`).
- Top bar: `next/src/components/dashboard/dashboard-top-bar.tsx` (add the entry button here).

## File structure

- Create `next/src/lib/summer-planner.ts` — types + `summerWindow`, `pickSummerYear`, `buildCandidates`, `planSummer` (pure).
- Create `next/src/lib/summer-planner.test.ts` — unit tests.
- Create `next/src/components/dashboard/summer-plan/summer-plan.tsx` — orchestrator (owns lock/exclude state, regenerate/swap/reset) + summary + trip list.
- Create `next/src/components/dashboard/summer-plan/trip-card.tsx` — one trip card (presentational).
- Create `next/src/components/dashboard/summer-plan/summer-strip.tsx` — the Jun–Sep strip (reuses timeline axis/track).
- Create `next/src/components/dashboard/summer-plan/summer-plan.test.tsx` — component smoke test.
- Create `next/src/app/app/plan/page.tsx` — route; wires hooks, computes window, renders `<SummerPlan>`.
- Modify `next/src/components/dashboard/dashboard-top-bar.tsx` — add a "Plan summer" link to `/app/plan`.

---

## Task 1: Window helpers + candidate building (pure, TDD)

**Files:**
- Create: `next/src/lib/summer-planner.ts`
- Test: `next/src/lib/summer-planner.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// next/src/lib/summer-planner.test.ts
import { describe, it, expect } from "vitest";
import { summerWindow, pickSummerYear, buildCandidates } from "./summer-planner";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

function site(siteName: string, matches: Array<[string, string]>): SiteAvailability {
    return {
        siteId: `id-${siteName}`,
        siteName,
        dates: [],
        excludedMatches: [],
        matches: matches.map(([from, to]) => ({
            from,
            to,
            nights: Math.round((+new Date(to) - +new Date(from)) / 86400000),
        })),
    };
}
function cg(id: string, name: string, favorites: string[], sites: SiteAvailability[]): ProcessedCampground {
    return {
        id,
        name,
        area: `${name} area`,
        sites: { favorites, worthwhile: [] },
        siteAvailability: Object.fromEntries(sites.map((s) => [s.siteId, s])),
    } as unknown as ProcessedCampground;
}

describe("summerWindow", () => {
    it("is Jun 1 – Sep 30 of the given year", () => {
        const w = summerWindow(2026);
        expect(w.start.getFullYear()).toBe(2026);
        expect(w.start.getMonth()).toBe(5); // June
        expect(w.start.getDate()).toBe(1);
        expect(w.end.getMonth()).toBe(8); // September
        expect(w.end.getDate()).toBe(30);
    });
});

describe("pickSummerYear", () => {
    it("chooses the year with the most Jun–Sep openings, else now's year", () => {
        const camps = [
            cg("1", "A", [], [site("a", [["2026-07-04", "2026-07-06"]])]),
            cg("2", "B", [], [site("b", [["2026-08-01", "2026-08-03"]])]),
            cg("3", "C", [], [site("c", [["2027-07-01", "2027-07-03"]])]),
        ];
        expect(pickSummerYear(camps, new Date(2026, 0, 1))).toBe(2026);
        expect(pickSummerYear([], new Date(2030, 0, 1))).toBe(2030);
    });
});

describe("buildCandidates", () => {
    it("emits one candidate per match whose arrival is in the window, tagged tier + weekend", () => {
        const camps = [
            cg("1", "Outlet", ["001"], [
                site("001", [["2026-07-03", "2026-07-05"]]), // Fri Jul 3 -> includes weekend, fav
                site("002", [["2026-05-20", "2026-05-22"]]), // before window -> excluded
            ]),
        ];
        const cands = buildCandidates(camps, summerWindow(2026));
        expect(cands).toHaveLength(1);
        expect(cands[0]).toMatchObject({
            campgroundId: "1",
            campgroundName: "Outlet",
            siteName: "001",
            tier: "fav",
            from: "2026-07-03",
            to: "2026-07-05",
            nights: 2,
            includesWeekend: true,
        });
    });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd next && npx vitest run src/lib/summer-planner.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the window + candidate code**

```ts
// next/src/lib/summer-planner.ts
import { type Tier, isWeekendNight, siteTier } from "@/lib/timeline";
import { toLocalIso } from "@/components/dashboard/helpers";
import type { ProcessedCampground } from "@/types/campground";

const DAY_MS = 86400000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PlanWindow {
    start: Date;
    end: Date;
}

export interface CandidateTrip {
    campgroundId: string;
    campgroundName: string;
    area: string;
    siteId: string;
    siteName: string;
    tier: Tier;
    from: string;
    to: string;
    nights: number;
    includesWeekend: boolean;
}

function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Jun 1 – Sep 30 of `year`. */
export function summerWindow(year: number): PlanWindow {
    const start = new Date(year, 5, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, 8, 30);
    end.setHours(0, 0, 0, 0);
    return { start, end };
}

/** Year with the most Jun–Sep openings across the snapshot; falls back to now's year. */
export function pickSummerYear(campgrounds: ProcessedCampground[], now: Date): number {
    const counts = new Map<number, number>();
    for (const cg of campgrounds) {
        for (const s of Object.values(cg.siteAvailability ?? {})) {
            for (const m of s.matches ?? []) {
                const d = parseLocalIso(m.from);
                const mo = d.getMonth();
                if (mo >= 5 && mo <= 8) counts.set(d.getFullYear(), (counts.get(d.getFullYear()) ?? 0) + 1);
            }
        }
    }
    let best = now.getFullYear();
    let bestN = -1;
    for (const [y, n] of counts) {
        if (n > bestN) {
            best = y;
            bestN = n;
        }
    }
    return best;
}

function matchIncludesWeekend(from: string, to: string): boolean {
    const end = parseLocalIso(to);
    for (const d = parseLocalIso(from); d < end; d.setDate(d.getDate() + 1)) {
        if (isWeekendNight(d)) return true;
    }
    return false;
}

export function buildCandidates(campgrounds: ProcessedCampground[], window: PlanWindow): CandidateTrip[] {
    const startIso = toLocalIso(window.start);
    const endIso = toLocalIso(window.end);
    const out: CandidateTrip[] = [];
    for (const cg of campgrounds) {
        for (const s of Object.values(cg.siteAvailability ?? {})) {
            const tier = siteTier(cg, s.siteName);
            for (const m of s.matches ?? []) {
                if (m.from < startIso || m.from > endIso) continue;
                out.push({
                    campgroundId: cg.id,
                    campgroundName: cg.name,
                    area: cg.area ?? "",
                    siteId: s.siteId,
                    siteName: s.siteName,
                    tier,
                    from: m.from,
                    to: m.to,
                    nights: m.nights,
                    includesWeekend: matchIncludesWeekend(m.from, m.to),
                });
            }
        }
    }
    return out;
}

// (planSummer + helpers added in Task 2; MON used there)
export const _MON = MON;
export { parseLocalIso as _parseLocalIso };
```

- [ ] **Step 4: Run tests — verify pass**

Run: `cd next && npx vitest run src/lib/summer-planner.test.ts`
Expected: PASS (3 files of assertions).

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/summer-planner.ts next/src/lib/summer-planner.test.ts
git commit -m "feat(planner): summer window + candidate building"
```

---

## Task 2: Greedy slot-fill `planSummer` (pure, TDD)

**Files:**
- Modify: `next/src/lib/summer-planner.ts`
- Modify: `next/src/lib/summer-planner.test.ts`

- [ ] **Step 1: Add the failing tests**

```ts
// append to next/src/lib/summer-planner.test.ts
import { planSummer } from "./summer-planner";

describe("planSummer", () => {
    const W = summerWindow(2026);
    // 5 campgrounds, each one favorite site open in a different month.
    const camps = [
        cg("1", "June CG", ["a"], [site("a", [["2026-06-12", "2026-06-14"]])]), // Fri Jun 12 weekend
        cg("2", "July CG", ["b"], [site("b", [["2026-07-15", "2026-07-17"]])]),
        cg("3", "Aug CG", ["c"], [site("c", [["2026-08-14", "2026-08-16"]])]), // Fri Aug 14 weekend
        cg("4", "Sep CG", ["d"], [site("d", [["2026-09-04", "2026-09-06"]])]), // Fri Sep 4 weekend
        cg("5", "Extra CG", ["e"], [site("e", [["2026-07-20", "2026-07-22"]])]),
    ];

    it("returns up to targetTrips at distinct campgrounds, sorted by date", () => {
        const plan = planSummer(camps, { window: W, targetTrips: 5 });
        expect(plan.trips.length).toBeGreaterThanOrEqual(4);
        const ids = plan.trips.map((t) => t.campgroundId);
        expect(new Set(ids).size).toBe(ids.length); // all distinct
        const froms = plan.trips.map((t) => t.from);
        expect(froms).toEqual([...froms].sort()); // chronological
        expect(plan.stats.campgroundCount).toBe(plan.trips.length);
    });

    it("each trip carries a date-deep-linked book url and stable id", () => {
        const plan = planSummer(camps, { window: W, targetTrips: 5 });
        const t = plan.trips[0]!;
        expect(t.id).toBe(`${t.campgroundId}:${t.siteId}:${t.from}:${t.to}`);
        expect(t.bookUrl).toContain(`/camping/campsites/${t.siteId}`);
        expect(t.bookUrl).toContain(`arrivalDate=${t.from}`);
        expect(t.bookUrl).toContain(`departureDate=${t.to}`);
    });

    it("prefers favorites and weekends when a slot has multiple options", () => {
        const competing = [
            cg("10", "Weekday Other", [], [site("x", [["2026-07-07", "2026-07-09"]])]), // Tue, other
            cg("11", "Weekend Fav", ["y"], [site("y", [["2026-07-10", "2026-07-12"]])]), // Fri, fav
        ];
        const plan = planSummer(competing, { window: W, targetTrips: 1 });
        expect(plan.trips[0]!.campgroundId).toBe("11");
    });

    it("returns fewer trips with a note when openings are scarce", () => {
        const sparse = [cg("1", "Only One", ["a"], [site("a", [["2026-07-15", "2026-07-17"]])])];
        const plan = planSummer(sparse, { window: W, targetTrips: 5 });
        expect(plan.trips).toHaveLength(1);
        expect(plan.notes.length).toBeGreaterThan(0);
    });

    it("keeps a locked trip fixed and re-plans the rest", () => {
        const plan1 = planSummer(camps, { window: W, targetTrips: 5 });
        const lockId = plan1.trips[1]!.id;
        const plan2 = planSummer(camps, { window: W, targetTrips: 5, lockedTripIds: [lockId] });
        expect(plan2.trips.some((t) => t.id === lockId && t.locked)).toBe(true);
    });

    it("excludeTripIds avoids re-picking when an alternative exists", () => {
        const twoInJuly = [
            cg("20", "First", ["a"], [site("a", [["2026-07-10", "2026-07-12"]])]),
            cg("21", "Second", ["b"], [site("b", [["2026-07-11", "2026-07-13"]])]),
        ];
        const first = planSummer(twoInJuly, { window: W, targetTrips: 1 });
        const firstId = first.trips[0]!.id;
        const second = planSummer(twoInJuly, { window: W, targetTrips: 1, excludeTripIds: [firstId] });
        expect(second.trips[0]!.id).not.toBe(firstId);
    });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd next && npx vitest run src/lib/summer-planner.test.ts`
Expected: FAIL (`planSummer` not exported).

- [ ] **Step 3: Implement `planSummer` (replace the Task 1 placeholder exports block)**

Replace the `// (planSummer + helpers ...)` block at the bottom of `summer-planner.ts` with:

```ts
export interface PlannedTrip extends CandidateTrip {
    id: string;
    slotIndex: number;
    bookUrl: string;
    locked: boolean;
}

export interface SummerPlan {
    trips: PlannedTrip[];
    stats: { tripCount: number; campgroundCount: number; weekendCount: number; window: PlanWindow };
    notes: string[];
}

export interface PlanOptions {
    window: PlanWindow;
    targetTrips: number;
    lockedTripIds?: string[];
    excludeTripIds?: string[];
}

const TIER_SCORE: Record<Tier, number> = { fav: 3, worth: 2, other: 1 };

function tripId(c: { campgroundId: string; siteId: string; from: string; to: string }): string {
    return `${c.campgroundId}:${c.siteId}:${c.from}:${c.to}`;
}

function bookUrlFor(c: CandidateTrip): string {
    return `https://www.recreation.gov/camping/campsites/${c.siteId}?arrivalDate=${c.from}&departureDate=${c.to}`;
}

function scoreOf(c: CandidateTrip): number {
    return TIER_SCORE[c.tier] + (c.includesWeekend ? 1.5 : 0);
}

function better(a: CandidateTrip, b: CandidateTrip): number {
    return (
        scoreOf(b) - scoreOf(a) ||
        a.from.localeCompare(b.from) ||
        b.nights - a.nights ||
        a.campgroundName.localeCompare(b.campgroundName) ||
        a.siteName.localeCompare(b.siteName)
    );
}

function pick(pool: CandidateTrip[]): CandidateTrip | null {
    if (pool.length === 0) return null;
    return [...pool].sort(better)[0]!;
}

function overlaps(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
    return a.from < b.to && b.from < a.to; // [from, to) half-open
}

function totalDays(w: PlanWindow): number {
    return Math.round((+w.end - +w.start) / DAY_MS) + 1;
}

function slotOf(w: PlanWindow, iso: string, slots: number): number {
    const idx = Math.round((+parseLocalIso(iso) - +w.start) / DAY_MS);
    const per = totalDays(w) / slots;
    return Math.min(slots - 1, Math.max(0, Math.floor(idx / per)));
}

function slotLabel(w: PlanWindow, s: number, slots: number): string {
    const per = totalDays(w) / slots;
    const startD = new Date(w.start);
    startD.setDate(startD.getDate() + Math.floor(s * per));
    const endD = new Date(w.start);
    endD.setDate(endD.getDate() + Math.min(totalDays(w) - 1, Math.floor((s + 1) * per) - 1));
    const a = MON[startD.getMonth()];
    const b = MON[endD.getMonth()];
    return a === b ? `${a}` : `${a}–${b}`;
}

export function planSummer(campgrounds: ProcessedCampground[], opts: PlanOptions): SummerPlan {
    const { window, targetTrips } = opts;
    const locked = new Set(opts.lockedTripIds ?? []);
    const excluded = new Set(opts.excludeTripIds ?? []);
    const candidates = buildCandidates(campgrounds, window);
    const byId = new Map(candidates.map((c) => [tripId(c), c]));

    const chosen: CandidateTrip[] = [];
    const usedCg = new Set<string>();
    const notes: string[] = [];

    // Place locked trips first (fixed); their slots are skipped below.
    for (const id of locked) {
        const c = byId.get(id);
        if (c && !chosen.some((x) => tripId(x) === id)) {
            chosen.push(c);
            usedCg.add(c.campgroundId);
        }
    }
    const lockedSlots = new Set(chosen.map((c) => slotOf(window, c.from, targetTrips)));

    const taken = (c: CandidateTrip) => chosen.some((x) => tripId(x) === tripId(c));

    for (let s = 0; s < targetTrips; s++) {
        if (lockedSlots.has(s)) continue;
        const inSlot = candidates.filter(
            (c) => slotOf(window, c.from, targetTrips) === s && !excluded.has(tripId(c)) && !taken(c),
        );
        // 1) unused campground, no date overlap
        let chosenC = pick(inSlot.filter((c) => !usedCg.has(c.campgroundId) && !chosen.some((x) => overlaps(x, c))));
        // 2) relax: allow date overlap
        if (!chosenC) {
            chosenC = pick(inSlot.filter((c) => !usedCg.has(c.campgroundId)));
            if (chosenC) notes.push(`Allowed a date overlap to fill ${slotLabel(window, s, targetTrips)}.`);
        }
        // 3) relax: allow a repeated campground
        if (!chosenC) {
            chosenC = pick(inSlot.filter((c) => !chosen.some((x) => overlaps(x, c))));
            if (chosenC) notes.push(`Repeated ${chosenC.campgroundName} to fill ${slotLabel(window, s, targetTrips)}.`);
        }
        // 4) borrow the best unused, non-overlapping candidate from anywhere
        if (!chosenC) {
            chosenC = pick(
                candidates.filter(
                    (c) =>
                        !excluded.has(tripId(c)) &&
                        !taken(c) &&
                        !usedCg.has(c.campgroundId) &&
                        !chosen.some((x) => overlaps(x, c)),
                ),
            );
            if (chosenC) notes.push(`No openings in ${slotLabel(window, s, targetTrips)}; pulled another from the season.`);
        }
        if (!chosenC) {
            notes.push(`No openings to fill ${slotLabel(window, s, targetTrips)}.`);
            continue;
        }
        chosen.push(chosenC);
        usedCg.add(chosenC.campgroundId);
    }

    chosen.sort((a, b) => a.from.localeCompare(b.from));
    const trips: PlannedTrip[] = chosen.map((c, i) => ({
        ...c,
        id: tripId(c),
        slotIndex: i,
        bookUrl: bookUrlFor(c),
        locked: locked.has(tripId(c)),
    }));

    return {
        trips,
        stats: {
            tripCount: trips.length,
            campgroundCount: new Set(trips.map((t) => t.campgroundId)).size,
            weekendCount: trips.filter((t) => t.includesWeekend).length,
            window,
        },
        notes,
    };
}
```

Then delete the temporary `export const _MON` / `export { parseLocalIso as _parseLocalIso }` lines from Task 1 (no longer needed; `MON`/`parseLocalIso` are used directly above).

- [ ] **Step 4: Run — verify pass**

Run: `cd next && npx vitest run src/lib/summer-planner.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/summer-planner.ts next/src/lib/summer-planner.test.ts
git commit -m "feat(planner): greedy slot-fill planSummer (variety/spread/weekend/favorites)"
```

---

## Task 3: TripCard + SummerPlan orchestrator

**Files:**
- Create: `next/src/components/dashboard/summer-plan/trip-card.tsx`
- Create: `next/src/components/dashboard/summer-plan/summer-plan.tsx`

Interactivity model (page state, core stays pure):
- `lockedTripIds: Set<string>` — toggled by the lock control; locked trips are never excluded.
- `excludeTripIds: Set<string>` — **accumulates**. Regenerate adds all current non-locked ids; Swap adds that one trip's id; Reset clears it (and clears locks).
- `plan = useMemo(() => planSummer(rows, { window, targetTrips: 5, lockedTripIds: [...locked], excludeTripIds: [...exclude] }), [rows, window, locked, exclude])`.

- [ ] **Step 1: Implement `trip-card.tsx`**

```tsx
import { CW } from "@/components/field-notes/cw-tokens";
import { TIER_MARK } from "@/lib/timeline";
import type { PlannedTrip } from "@/lib/summer-planner";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    return `${WEEKDAY[date.getDay()]} ${MON[date.getMonth()]} ${date.getDate()}`;
}

export function TripCard({
    trip,
    index,
    onToggleLock,
    onSwap,
}: {
    trip: PlannedTrip;
    index: number;
    onToggleLock: (id: string) => void;
    onSwap: (id: string) => void;
}) {
    return (
        <div
            className="flex flex-col gap-2 bg-cw-cream p-4"
            style={{ border: `1.5px solid ${CW.ink}`, boxShadow: `4px 4px 0 ${CW.forest}` }}
        >
            <div className="flex items-center justify-between gap-3">
                <span
                    className="font-mono-field font-bold uppercase"
                    style={{ fontSize: 11, letterSpacing: "0.16em", color: CW.clay }}
                >
                    Trip {index + 1}
                </span>
                <span className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onToggleLock(trip.id)}
                        aria-pressed={trip.locked}
                        className="font-mono-field uppercase"
                        style={{ fontSize: 10, letterSpacing: "0.1em", color: trip.locked ? CW.forest : CW.inkFaint }}
                    >
                        {trip.locked ? "★ Locked" : "Lock"}
                    </button>
                    {!trip.locked && (
                        <button
                            type="button"
                            onClick={() => onSwap(trip.id)}
                            className="font-mono-field uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.1em", color: CW.inkFaint }}
                        >
                            Swap
                        </button>
                    )}
                </span>
            </div>
            <div className="font-italic-serif italic" style={{ fontSize: 22, color: CW.ink }}>
                {trip.campgroundName}
            </div>
            {trip.area && (
                <div className="font-body-serif" style={{ fontSize: 12, color: CW.inkSoft }}>
                    {trip.area}
                </div>
            )}
            <div className="font-body-serif" style={{ fontSize: 14, color: CW.ink }}>
                {fmt(trip.from)} – {fmt(trip.to)} · {trip.nights}n
                {trip.includesWeekend && (
                    <span
                        className="ml-2 font-mono-field uppercase"
                        style={{ fontSize: 9, letterSpacing: "0.1em", color: CW.clay }}
                    >
                        incl. weekend
                    </span>
                )}
            </div>
            <div className="font-mono-field" style={{ fontSize: 12, color: CW.ink }}>
                <span style={{ color: trip.tier === "fav" ? CW.clay : trip.tier === "worth" ? CW.forest : CW.inkFaint }}>
                    {TIER_MARK[trip.tier]}
                </span>{" "}
                Site {trip.siteName}
            </div>
            <a
                href={trip.bookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-center font-poster font-extrabold uppercase"
                style={{ background: CW.forest, color: CW.cream, fontSize: 12, letterSpacing: "0.12em", padding: "10px" }}
            >
                Book on recreation.gov →
            </a>
        </div>
    );
}
```

- [ ] **Step 2: Implement `summer-plan.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { planSummer, type PlanWindow } from "@/lib/summer-planner";
import type { ProcessedCampground } from "@/types/campground";
import { TripCard } from "./trip-card";
import { SummerStrip } from "./summer-strip";

export function SummerPlan({ rows, window }: { rows: ProcessedCampground[]; window: PlanWindow }) {
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [exclude, setExclude] = useState<Set<string>>(new Set());

    const plan = useMemo(
        () =>
            planSummer(rows, {
                window,
                targetTrips: 5,
                lockedTripIds: [...locked],
                excludeTripIds: [...exclude],
            }),
        [rows, window, locked, exclude],
    );

    const toggleLock = (id: string) =>
        setLocked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const swap = (id: string) => setExclude((prev) => new Set(prev).add(id));
    const regenerate = () =>
        setExclude((prev) => {
            const next = new Set(prev);
            for (const t of plan.trips) if (!t.locked) next.add(t.id);
            return next;
        });
    const reset = () => {
        setExclude(new Set());
        setLocked(new Set());
    };

    const monLabel = (d: Date) => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];

    return (
        <div>
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                    {plan.stats.tripCount} trip{plan.stats.tripCount === 1 ? "" : "s"} ·{" "}
                    {plan.stats.campgroundCount} campground{plan.stats.campgroundCount === 1 ? "" : "s"} ·{" "}
                    {plan.stats.weekendCount} include a weekend ·{" "}
                    {monLabel(window.start)}–{monLabel(window.end)}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={regenerate}
                        className="font-poster font-extrabold uppercase"
                        style={{ background: CW.forest, color: CW.cream, fontSize: 11, letterSpacing: "0.12em", padding: "10px 16px", border: `1.5px solid ${CW.forest}` }}
                    >
                        Regenerate
                    </button>
                    <button
                        type="button"
                        onClick={reset}
                        className="font-poster font-extrabold uppercase"
                        style={{ background: CW.paper, color: CW.ink, fontSize: 11, letterSpacing: "0.12em", padding: "10px 16px", border: `1.5px solid ${CW.ink}` }}
                    >
                        Reset
                    </button>
                </div>
            </div>

            {plan.trips.length === 0 ? (
                <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkFaint }}>
                    No summer openings yet — check back as sites free up.
                </div>
            ) : (
                <>
                    <div className="mb-5">
                        <SummerStrip window={window} trips={plan.trips} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {plan.trips.map((t, i) => (
                            <TripCard key={t.id} trip={t} index={i} onToggleLock={toggleLock} onSwap={swap} />
                        ))}
                    </div>
                </>
            )}

            {plan.notes.length > 0 && (
                <ul className="mt-4 space-y-1">
                    {plan.notes.map((n, i) => (
                        <li key={i} className="font-italic-serif italic" style={{ fontSize: 13, color: CW.inkSoft }}>
                            {n}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd next && npx tsc --noEmit`
Expected: errors only about the not-yet-created `./summer-strip` import (resolved in Task 4). If you implement Task 4 first, expect clean.

- [ ] **Step 4: Commit**

```bash
git add next/src/components/dashboard/summer-plan/trip-card.tsx next/src/components/dashboard/summer-plan/summer-plan.tsx
git commit -m "feat(planner): trip cards + plan orchestrator (lock/swap/regenerate/reset)"
```

---

## Task 4: SummerStrip (reuse timeline)

**Files:**
- Create: `next/src/components/dashboard/summer-plan/summer-strip.tsx`

Shows the chosen trips on one Jun–Sep axis. Reuses `buildHorizon`, `dayIndexOf`-style math via the timeline `TimelineAxis` + `AvailabilityBlock`.

- [ ] **Step 1: Implement**

```tsx
import { CW } from "@/components/field-notes/cw-tokens";
import { buildHorizon, dayIndexOf } from "@/lib/timeline";
import { TimelineAxis } from "@/components/dashboard/timeline/timeline-axis";
import { AvailabilityBlock } from "@/components/dashboard/timeline/availability-block";
import type { PlanWindow, PlannedTrip } from "@/lib/summer-planner";

export function SummerStrip({ window, trips }: { window: PlanWindow; trips: PlannedTrip[] }) {
    const horizon = buildHorizon(window.start, window.end);
    return (
        <div className="overflow-hidden bg-cw-cream" style={{ border: `1.5px solid ${CW.ink}` }}>
            <div style={{ borderBottom: `2px solid ${CW.ink}`, padding: "10px 26px 0" }}>
                <TimelineAxis horizon={horizon} />
            </div>
            <div className="relative" style={{ height: 44, padding: "0 26px" }}>
                <div className="absolute inset-0" style={{ marginLeft: 26, marginRight: 26 }}>
                    {trips.map((t) => {
                        const s = dayIndexOf(horizon, t.from);
                        const e = dayIndexOf(horizon, t.to) - 1; // last night
                        if (e < s) return null;
                        return (
                            <AvailabilityBlock
                                key={t.id}
                                horizon={horizon}
                                run={[Math.max(0, s), Math.min(horizon.totalDays - 1, e)]}
                                kind="open"
                                ring={t.tier === "fav"}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
```

Note: `dayIndexOf` must be exported from `timeline.ts` — it already is. If `AvailabilityBlock`/`TimelineAxis` are not exported as named exports, confirm and adjust the import (they are function-declared named exports).

- [ ] **Step 2: Typecheck**

Run: `cd next && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add next/src/components/dashboard/summer-plan/summer-strip.tsx
git commit -m "feat(planner): summer strip reusing the timeline axis + blocks"
```

---

## Task 5: `/app/plan` route + top-bar entry

**Files:**
- Create: `next/src/app/app/plan/page.tsx`
- Modify: `next/src/components/dashboard/dashboard-top-bar.tsx`

- [ ] **Step 1: Implement the route**

```tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CW } from "@/components/field-notes/cw-tokens";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { pickSummerYear, summerWindow } from "@/lib/summer-planner";
import { SummerPlan } from "@/components/dashboard/summer-plan/summer-plan";

export default function PlanPage() {
    const { siteConfig, isHydrating } = useUserCampgrounds();
    const { campgroundsByAreas, isFetching } = useCampgroundsData({ enabled: !isHydrating, siteConfig });

    const window = useMemo(
        () => summerWindow(pickSummerYear(campgroundsByAreas, new Date())),
        [campgroundsByAreas],
    );

    const loading = isHydrating || (isFetching && campgroundsByAreas.length === 0);

    return (
        <main className="min-h-screen bg-cw-paper text-cw-ink font-body-serif">
            <div className="mx-auto w-full max-w-screen-2xl" style={{ padding: "24px 24px 60px" }}>
                <Link
                    href="/app"
                    className="font-mono-field uppercase"
                    style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.clay }}
                >
                    ← Dashboard
                </Link>
                <div className="pt-5 mb-6">
                    <div
                        className="font-mono-field font-medium uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.22em", color: CW.clay }}
                    >
                        § Field Station · An ideal summer
                    </div>
                    <h1 className="m-0 mt-2 font-poster font-black uppercase leading-none" style={{ fontSize: 40 }}>
                        Plan your{" "}
                        <span className="font-italic-serif italic normal-case text-cw-forest" style={{ fontSize: 32 }}>
                            summer
                        </span>
                    </h1>
                    <p className="mt-2 font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                        Five trips, different places, spread across the season — built from what&apos;s open now.
                    </p>
                </div>

                {loading ? (
                    <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                        Reading your watchlist availability…
                    </div>
                ) : (
                    <SummerPlan rows={campgroundsByAreas} window={window} />
                )}
            </div>
        </main>
    );
}
```

- [ ] **Step 2: Add the top-bar entry button**

In `next/src/components/dashboard/dashboard-top-bar.tsx`, add a link to `/app/plan` next to the existing "Add campground" action. Match the existing button styling in that file; use a `next/link` `Link` to `/app/plan` labeled "Plan summer". (Open the file, find where `onAddCampground` is wired, and add a sibling `<Link href="/app/plan" className="<same classes as the add button>">Plan summer</Link>`.)

- [ ] **Step 3: Verify**

Run: `cd next && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add next/src/app/app/plan/page.tsx next/src/components/dashboard/dashboard-top-bar.tsx
git commit -m "feat(planner): /app/plan route + dashboard entry button"
```

---

## Task 6: Component smoke test

**Files:**
- Create: `next/src/components/dashboard/summer-plan/summer-plan.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummerPlan } from "./summer-plan";
import { summerWindow } from "@/lib/summer-planner";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

function site(name: string, from: string, to: string): SiteAvailability {
    return {
        siteId: `id-${name}`,
        siteName: name,
        dates: [],
        excludedMatches: [],
        matches: [{ from, to, nights: Math.round((+new Date(to) - +new Date(from)) / 86400000) }],
    };
}
function cg(id: string, name: string, s: SiteAvailability): ProcessedCampground {
    return {
        id,
        name,
        area: "",
        sites: { favorites: [s.siteName], worthwhile: [] },
        siteAvailability: { [s.siteId]: s },
    } as unknown as ProcessedCampground;
}

const rows = [
    cg("1", "June CG", site("a", "2026-06-12", "2026-06-14")),
    cg("2", "July CG", site("b", "2026-07-17", "2026-07-19")),
    cg("3", "Aug CG", site("c", "2026-08-14", "2026-08-16")),
];

describe("SummerPlan", () => {
    it("renders a trip card per planned trip with a book link", () => {
        render(<SummerPlan rows={rows} window={summerWindow(2026)} />);
        expect(screen.getByText("June CG")).toBeTruthy();
        expect(screen.getByText("July CG")).toBeTruthy();
        expect(screen.getAllByRole("link", { name: /book on recreation.gov/i }).length).toBeGreaterThanOrEqual(3);
    });

    it("regenerate changes the itinerary when alternatives exist", () => {
        const competing = [
            cg("10", "First July", site("x", "2026-07-10", "2026-07-12")),
            cg("11", "Second July", site("y", "2026-07-11", "2026-07-13")),
        ];
        render(<SummerPlan rows={competing} window={summerWindow(2026)} />);
        // Both fall in the same slot region; regenerate should swap which one shows.
        const before = screen.getAllByText(/July$/).map((n) => n.textContent);
        fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
        const after = screen.getAllByText(/July$/).map((n) => n.textContent);
        expect(after).not.toEqual(before);
    });
});
```

- [ ] **Step 2: Run — verify pass**

Run: `cd next && npx vitest run src/components/dashboard/summer-plan/summer-plan.test.tsx`
Expected: PASS. (If the regenerate assertion is flaky due to both trips fitting in different slots with targetTrips 5, tighten the fixture so both land in the same slot, or assert the rendered set differs.)

- [ ] **Step 3: Commit**

```bash
git add next/src/components/dashboard/summer-plan/summer-plan.test.tsx
git commit -m "test(planner): SummerPlan renders trips + regenerate swaps"
```

---

## Task 7: Verify + ship

- [ ] **Step 1:** `cd next && npx tsc --noEmit` (clean).
- [ ] **Step 2:** `cd next && npx vitest run` (all pass).
- [ ] **Step 3:** `cd next && npm run lint` (0 warnings) and `npm run format`.
- [ ] **Step 4:** `cd next && npm run build` (succeeds).
- [ ] **Step 5:** Manual check at `/app/plan`: itinerary renders, strip shows the picks on the Jun–Sep axis, Book links deep-link to the right dates, Lock/Swap/Regenerate/Reset behave, edge states (no openings / few openings) read correctly. Visual fidelity can't be unit-tested.
- [ ] **Step 6:** Commit anything outstanding; hand back for push/deploy (remember: any branch push deploys to prod — see `reference_campwatch_deploy_all_branches`).

---

## Self-review (author)

- **Spec coverage:** route + entry (T5); pure core candidates/window/greedy/lock/exclude (T1-2); favorites/weekend scoring + variety + spread via slots (T2); trip cards w/ book links + lock/swap (T3); summary + summer strip reuse (T3-4); regenerate/reset (T3); edge states (T3/T5); tests (T1/T2/T6). Water/kid explicitly out of scope (spec v2). ✓
- **Placeholder scan:** none — all steps carry real code or concrete file edits. The one prose edit (T5 step 2) names the exact file, location, and styling source.
- **Type consistency:** `CandidateTrip`/`PlannedTrip`/`SummerPlan`/`PlanOptions`/`PlanWindow` defined in T1-2 and consumed identically in T3-6; `planSummer`/`buildCandidates`/`summerWindow`/`pickSummerYear` signatures match call sites; trip `id` format identical in core and test; reused timeline exports (`buildHorizon`, `dayIndexOf`, `siteTier`, `isWeekendNight`, `TIER_MARK`, `TimelineAxis`, `AvailabilityBlock`) all already exist.
- **Note:** Task 1 adds two temporary `_`-prefixed exports that Task 2 removes — called out explicitly so it isn't mistaken for dead code.
