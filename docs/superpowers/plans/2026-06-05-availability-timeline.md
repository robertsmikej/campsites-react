# Availability Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's per-campground tick-mark availability rows with a shared-axis "Field Notes" timeline — one common date axis, every campground a row, openings drawn as date-positioned two-tone blocks, expandable into per-site rows — plus a mobile compress-to-fit watchlist + tap-to-detail screen.

**Architecture:** A pure timeline-math/data-reduction module (fully unit-tested) feeds presentational React components. Desktop renders a single "plate" of campground rows over one axis; clicking a campground fans out per-site rows. Mobile compresses the same horizon to screen width (no horizontal scroll) and taps through to a detail screen (open-windows list + relevant-month mini-calendars + per-site rows + booking CTA). The timeline replaces `WatchlistTable` inside `WatchlistSection`; the openings feed, date-range picker (now the horizon control), and grouping stay.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (existing `cw-*` color tokens + `font-poster/italic-serif/body-serif/mono-field/hand` already wired via `next/font`), Vitest + happy-dom + @testing-library/react.

**Design source of truth (pixel spec):** `/tmp/cw_design/camp/project/design_handoff_availability_and_modal/Availability Timeline.html` (desktop, vanilla JS — block math in `daysFill()`, `blocks()`, `statusUnion()`, `runsFromStatus()`, `rangeLabel()`), `mobile-timeline.jsx` (mobile), and the handoff `README.md`. Colors/fonts/measurements in those files are final.

**Key design decisions already made (do not re-litigate):**
- Tiers are **per-site** (`fav`/`worth`/`other`), never per-campground. Mobile does NOT group campgrounds by tier (the README's mobile "tier sections" text is superseded by the user's later per-site correction). Mobile watchlist is a flat list of campground rows.
- Horizon = the dashboard's existing `dateRange {start,end}` (default 120 days from today, clamped to the watchlist's latest season-end). NOT a hardcoded May–Sep window.
- "Weekend" = Friday + Saturday **nights** everywhere: `d.getDay() === 5 || d.getDay() === 6`.
- "Limited (1–2 sites)" is a **campground-level** concept computed from per-day open-site counts (≥3 sites open = open/forest; 1–2 = limited/mustard; 0 = booked). **Per-site rows show open blocks only** (a single site's night is open or it isn't — no per-site "limited").
- Replace `WatchlistTable` rendering; keep `WatchlistSection`'s masthead, the date-picker strip, grouping, and the openings feed.

---

## Existing code to reuse (do not reinvent)

- **Data:** `ProcessedCampground` (`src/types/campground.ts`): `siteAvailability: Record<siteId, SiteAvailability>`, `sites: {favorites: string[]; worthwhile: string[]}` (arrays of site **names/labels**), `dates?`, `totalSitesCount?`, `area?`, `name`, `id`. `SiteAvailability`: `{ siteId, siteName, matches: StayMatch[], campsite_type? }`. `StayMatch`: `{ from, to, nights }` where `from` = arrival ISO (inclusive first night), `to` = departure ISO (exclusive — last night is `to`−1 day), `nights` count.
- **Tokens:** `CW` from `src/components/field-notes/cw-tokens.ts` (`CW.forest/clay/mustard/ink/inkSoft/inkSubtle/inkFaint/rule/ruleSoft/paper/cream`, all `var(--cw-*)` so dark-mode works). Tailwind classes: `text-cw-forest`, `bg-cw-cream`, `border-cw-ink`, `font-poster`, `font-italic-serif`, `font-body-serif`, `font-mono-field`.
- **Date helper:** `toLocalIso(d: Date): string` from `src/components/dashboard/helpers.ts`.
- **Existing reservation/label helpers** (currently private in `watchlist-row.tsx`, lines ~205–218): `reservationUrl(site)`, `humanKind(site, isFavorite)`. Task 1 extracts these into the shared module so both old and new code use one copy.
- **Wiring:** `src/app/app/page.tsx` builds `campgroundsByAreas` (via `useCampgroundsData`, already overlays live favorites), passes it to `WatchlistSection`. `dateRange` from `useDashboardPrefs`. `onRatingChange(campgroundId, siteName, "favorite"|"worthwhile"|"unrated")` already persists per-site tiers. `onEditSettings(id)` opens the config dialog. `isMobile` from `useIsMobile()`.

---

## File structure

- Create `src/lib/timeline.ts` — pure horizon/day-index math + per-campground & per-site availability reduction. No React.
- Create `src/lib/timeline.test.ts` — unit tests for the above.
- Create `src/components/dashboard/timeline/availability-timeline.tsx` — desktop plate (header axis + rows + footer), the replacement for `WatchlistTable` on desktop.
- Create `src/components/dashboard/timeline/timeline-track.tsx` — the shared track (grid + weekend shading + month dividers + NOW line + blocks). Used by desktop summary rows, desktop site rows, and mobile (compressed).
- Create `src/components/dashboard/timeline/availability-block.tsx` — one positioned two-tone block with width-tiered label + hover tag.
- Create `src/components/dashboard/timeline/timeline-axis.tsx` — month labels positioned on the axis.
- Create `src/components/dashboard/timeline/campground-timeline-row.tsx` — desktop campground summary row (meta cell + summary track) + its expandable per-site rows.
- Create `src/components/dashboard/timeline/mobile-timeline.tsx` — mobile watchlist (flat campground rows w/ compressed track + status pill) and the detail screen.
- Create `src/components/dashboard/timeline/timeline.test.tsx` — component smoke/behavior tests (render, expand toggle, block positioning sanity).
- Modify `src/components/dashboard/watchlist-section/watchlist-section.tsx` — swap the `WatchlistTable` block for `AvailabilityTimeline` (desktop) / `MobileTimeline` (mobile); update the legend strip to the timeline legend.
- Modify `src/components/dashboard/watchlist-section/watchlist-row.tsx` — remove the now-shared `reservationUrl`/`humanKind` (import from the module) to avoid duplication. (Leave the rest; `WatchlistTable`/`WatchlistRow` may remain for the read-only `/discover` path — see Task 9.)

---

## Task 1: Timeline math + data reduction (pure, TDD)

**Files:**
- Create: `src/lib/timeline.ts`
- Test: `src/lib/timeline.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/timeline.test.ts
import { describe, it, expect } from "vitest";
import {
    buildHorizon,
    dayIndexOf,
    pct,
    isWeekendNight,
    campgroundRuns,
    siteOpenRuns,
    siteTier,
    rangeLabel,
} from "./timeline";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

const HORIZON = buildHorizon(new Date(2026, 4, 1), new Date(2026, 8, 30)); // May 1 – Sep 30 2026

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

describe("buildHorizon / dayIndexOf / pct", () => {
    it("counts inclusive days and indexes by date", () => {
        expect(HORIZON.totalDays).toBe(153); // May(31)+Jun(30)+Jul(31)+Aug(31)+Sep(30)
        expect(dayIndexOf(HORIZON, "2026-05-01")).toBe(0);
        expect(dayIndexOf(HORIZON, "2026-05-02")).toBe(1);
        expect(dayIndexOf(HORIZON, "2026-09-30")).toBe(152);
    });
    it("pct maps index to percent of axis", () => {
        expect(pct(HORIZON, 0)).toBe(0);
        expect(pct(HORIZON, HORIZON.totalDays)).toBe(100);
    });
});

describe("isWeekendNight", () => {
    it("is true only for Fri and Sat", () => {
        expect(isWeekendNight(new Date(2026, 4, 1))).toBe(true); // Fri May 1 2026
        expect(isWeekendNight(new Date(2026, 4, 2))).toBe(true); // Sat
        expect(isWeekendNight(new Date(2026, 4, 3))).toBe(false); // Sun
    });
});

describe("siteTier", () => {
    const cg = { sites: { favorites: ["A-07"], worthwhile: ["B-23"] } } as ProcessedCampground;
    it("classifies by site name", () => {
        expect(siteTier(cg, "A-07")).toBe("fav");
        expect(siteTier(cg, "B-23")).toBe("worth");
        expect(siteTier(cg, "C-31")).toBe("other");
    });
});

describe("siteOpenRuns", () => {
    it("converts matches to inclusive night index ranges, merging adjacency", () => {
        // arrival May 23, departure May 25 -> nights May23,May24 -> idx [22,23]
        const s = site("A-07", [["2026-05-23", "2026-05-25"]]);
        expect(siteOpenRuns(HORIZON, s)).toEqual([[22, 23]]);
    });
    it("returns [] when the site has no matches in the horizon", () => {
        expect(siteOpenRuns(HORIZON, site("C-31", []))).toEqual([]);
    });
});

describe("campgroundRuns", () => {
    it("marks a night open when >=3 sites cover it, limited when 1-2", () => {
        const cg = {
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {
                a: site("a", [["2026-05-10", "2026-05-11"]]),
                b: site("b", [["2026-05-10", "2026-05-11"]]),
                c: site("c", [["2026-05-10", "2026-05-11"]]), // 3 sites on May 10 -> open
                d: site("d", [["2026-05-12", "2026-05-13"]]), // 1 site on May 12 -> limited
            },
        } as unknown as ProcessedCampground;
        const { open, limited, openNights } = campgroundRuns(HORIZON, cg);
        expect(open).toEqual([[9, 9]]); // May 10 night
        expect(limited).toEqual([[11, 11]]); // May 12 night
        expect(openNights).toBe(1);
    });
});

describe("rangeLabel", () => {
    it("same month", () => expect(rangeLabel(HORIZON, 22, 23)).toBe("May 23–24"));
    it("single night", () => expect(rangeLabel(HORIZON, 22, 22)).toBe("May 23"));
    it("cross month", () => expect(rangeLabel(HORIZON, 30, 31)).toBe("May 31–Jun 1"));
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/timeline.test.ts` — Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement `src/lib/timeline.ts`**

```ts
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";
import { toLocalIso } from "@/components/dashboard/helpers";

export type Tier = "fav" | "worth" | "other";
export const TIER_ORDER: Record<Tier, number> = { fav: 0, worth: 1, other: 2 };
export const TIER_MARK: Record<Tier, string> = { fav: "★", worth: "◇", other: "·" };

const DAY_MS = 86400000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Horizon {
    start: Date; // local midnight
    totalDays: number; // inclusive day count across [start, end]
}

export interface Run {
    /** inclusive night index range */
    0: number;
    1: number;
}

export function buildHorizon(start: Date, end: Date): Horizon {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    const totalDays = Math.round((+e - +s) / DAY_MS) + 1;
    return { start: s, totalDays: Math.max(1, totalDays) };
}

/** day index of an ISO (YYYY-MM-DD) or Date relative to horizon start. */
export function dayIndexOf(h: Horizon, iso: string | Date): number {
    const d = typeof iso === "string" ? parseLocalIso(iso) : new Date(iso);
    d.setHours(0, 0, 0, 0);
    return Math.round((+d - +h.start) / DAY_MS);
}

export function dateAt(h: Horizon, i: number): Date {
    const d = new Date(h.start);
    d.setDate(d.getDate() + i);
    return d;
}

export function pct(h: Horizon, i: number): number {
    return (i / h.totalDays) * 100;
}

export function isWeekendNight(d: Date): boolean {
    const g = d.getDay();
    return g === 5 || g === 6;
}

export function siteTier(cg: Pick<ProcessedCampground, "sites">, siteName: string): Tier {
    if (cg.sites?.favorites?.includes(siteName)) return "fav";
    if (cg.sites?.worthwhile?.includes(siteName)) return "worth";
    return "other";
}

function parseLocalIso(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Night indices [from, to) clamped to the horizon, for one match. */
function matchNightIndices(h: Horizon, from: string, to: string): [number, number] | null {
    const a = dayIndexOf(h, from);
    const b = dayIndexOf(h, to) - 1; // departure date is not a night
    const lo = Math.max(0, a);
    const hi = Math.min(h.totalDays - 1, b);
    if (hi < lo) return null;
    return [lo, hi];
}

/** Merge sorted inclusive ranges that touch or overlap. */
function mergeRuns(ranges: Array<[number, number]>): Array<[number, number]> {
    const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
    const out: Array<[number, number]> = [];
    for (const [s, e] of sorted) {
        const last = out[out.length - 1];
        if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
        else out.push([s, e]);
    }
    return out;
}

export function siteOpenRuns(h: Horizon, site: SiteAvailability): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    for (const m of site.matches ?? []) {
        const r = matchNightIndices(h, m.from, m.to);
        if (r) ranges.push(r);
    }
    return mergeRuns(ranges);
}

export interface CampgroundRunsResult {
    open: Array<[number, number]>;
    limited: Array<[number, number]>;
    openNights: number;
    limitedNights: number;
}

/** Per-day open-site count -> status runs (>=3 open, 1-2 limited, 0 booked). */
export function campgroundRuns(h: Horizon, cg: ProcessedCampground): CampgroundRunsResult {
    const counts = new Array(h.totalDays).fill(0);
    for (const site of Object.values(cg.siteAvailability ?? {})) {
        for (const [lo, hi] of siteOpenRuns(h, site)) {
            for (let i = lo; i <= hi; i++) counts[i]++;
        }
    }
    const status = counts.map((n) => (n >= 3 ? 2 : n >= 1 ? 1 : 0));
    return {
        open: runsFromStatus(status, 2),
        limited: runsFromStatus(status, 1),
        openNights: status.filter((s) => s === 2).length,
        limitedNights: status.filter((s) => s === 1).length,
    };
}

export function runsFromStatus(arr: number[], val: number): Array<[number, number]> {
    const res: Array<[number, number]> = [];
    let i = 0;
    while (i < arr.length) {
        if (arr[i] === val) {
            let j = i;
            while (j < arr.length && arr[j] === val) j++;
            res.push([i, j - 1]);
            i = j;
        } else i++;
    }
    return res;
}

export function rangeLabel(h: Horizon, s: number, e: number): string {
    const ds = dateAt(h, s);
    const de = dateAt(h, e);
    if (s === e) return `${MON[ds.getMonth()]} ${ds.getDate()}`;
    if (ds.getMonth() === de.getMonth())
        return `${MON[ds.getMonth()]} ${ds.getDate()}–${de.getDate()}`;
    return `${MON[ds.getMonth()]} ${ds.getDate()}–${MON[de.getMonth()]} ${de.getDate()}`;
}

/** Month-start ticks within the horizon, for the axis + dividers. */
export function monthTicks(h: Horizon): Array<{ index: number; label: string; year: number }> {
    const ticks: Array<{ index: number; label: string; year: number }> = [];
    const end = dateAt(h, h.totalDays - 1);
    const cur = new Date(h.start.getFullYear(), h.start.getMonth(), 1);
    while (cur <= end) {
        const idx = Math.round((+cur - +h.start) / DAY_MS);
        ticks.push({ index: Math.max(0, idx), label: MON[cur.getMonth()]!, year: cur.getFullYear() });
        cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
}

export function nowIndex(h: Horizon, now: Date = new Date()): number | null {
    const i = dayIndexOf(h, now);
    return i >= 0 && i < h.totalDays ? i : null;
}

// Re-exported shared helpers so old + new render code share one copy.
export function reservationUrl(site: SiteAvailability): string {
    const m = site.matches?.[0];
    if (!m) return `https://www.recreation.gov/camping/campsites/${site.siteId}`;
    return `https://www.recreation.gov/camping/campsites/${site.siteId}?arrivalDate=${m.from}&departureDate=${m.to}`;
}
```

Note: `nowIndex` defaults `new Date()`; tests pass an explicit `now` if needed. The horizon-relative `dayIndexOf(Date)` path is used by `nowIndex`.

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/lib/timeline.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/timeline.ts next/src/lib/timeline.test.ts
git commit -m "feat(timeline): pure horizon math + availability reduction"
```

---

## Task 2: AvailabilityBlock component

**Files:**
- Create: `src/components/dashboard/timeline/availability-block.tsx`

Renders one absolutely-positioned block. Props: `{ horizon, run: [number,number], kind: "open"|"limited", site?: boolean }`.

Spec (from `Availability Timeline.html` `.blk` rules and `blocks()`):
- Container `position:absolute; top:50%; transform:translateY(-50%)`, `left: pct(s)%`, `width: pct(e-s+1)%`, `min-width:7px`, `height:24px` (summary) / `15px` (site, `.blk.site`), `border-radius:5px` (4px for site), `display:flex; align-items:center; justify-content:center; padding:0 8px; white-space:nowrap; overflow:visible`.
- Shadow: open `0 2px 6px -2px rgba(20,42,29,.6)`; limited `0 2px 6px -3px rgba(201,162,39,.7)`.
- **Two-tone fill** (`.days` inner absolute layer `inset:0; display:flex; border-radius:inherit; overflow:hidden`): one `<div className="dseg">` per night `for i in [s..e]`, `flex:1`, weekend (`isWeekendNight(dateAt(horizon,i))`) gets the brighter/solid variant:
  - open weekday → `#1F3D2A` (use `CW.forest`); open weekend → `#3c7a4f` (literal brighter green — add `--cw-forest-bright:#3c7a4f` to `globals.css` `:root` and a dark variant, expose as `CW.forestBright`; see Task 8).
  - limited weekday → `repeating-linear-gradient(45deg, var(--cw-mustard) 0 5px, color-mix(in srgb, var(--cw-mustard) 40%, transparent) 5px 10px)`; limited weekend → solid `var(--cw-mustard)`.
- **Label by width** (`pct(e-s+1)`): site bars → `bl` (date) if width≥6.5 else hover `tag`; summary → date+`N nts` if ≥11, date if ≥6.5, else hover `tag`. `bl`: `font-mono-field 11px` (site 9px), color cream (open) / `#3a2f06` (limited). `bn`: `font-italic-serif 12px`, `rgba(251,246,234,0.82)`, `margin-left:7px`.
- **Hover tag** (`.tag`): absolute above block, `bottom:calc(100% + 4px); left:50%; translateX(-50%)`, `bg:var(--cw-ink); color:var(--cw-cream); font-mono-field 10px; padding:3px 6px; border-radius:4px`, hidden (`opacity:0`) → `group-hover:opacity-100`. Content = `rangeLabel · N night(s)`.
- Set `title={tip}` on the block for native tooltip too.

- [ ] Step 1: Implement the component with the above (use Tailwind classes + inline `style` for `left/width` and the gradient strings; `CW` for colors).
- [ ] Step 2: Verify it typechecks (`npx tsc --noEmit`).
- [ ] Step 3: Commit (`feat(timeline): availability block with two-tone weekend fill`).

---

## Task 3: TimelineAxis + TimelineTrack components

**Files:**
- Create: `src/components/dashboard/timeline/timeline-axis.tsx`
- Create: `src/components/dashboard/timeline/timeline-track.tsx`

**TimelineAxis** — props `{ horizon }`. `position:relative; height:30px`. For each `monthTicks(horizon)`: a `.mo` absolutely at `left: pct(index)%`, `font-poster 900 15px uppercase letter-spacing:.04em color:var(--cw-ink)`, with a `<span>` year line `font-mono-field 9px var(--cw-ink-soft)`. (Mobile axis variant: smaller, `position:sticky; top:0` — handled in mobile component.)

**TimelineTrack** — props `{ horizon, open, limited, site?, height? }`. The layered canvas:
- Outer `position:relative; height:64px (summary) / 42px (site); padding:0 26px`. Expose `--pad:26px`.
- Grid layer (`position:absolute; inset:0`):
  1. **Weekend shading:** for each night index `i` where `dateAt(i).getDay()===5` (Friday), a `div` `position:absolute; top:0; bottom:0; left:pct(i)%; width:pct(2)%; background:rgba(182,92,63,0.06)` (covers Fri+Sat). Use `color-mix(in srgb, var(--cw-clay) 6%, transparent)` so dark mode tracks.
  2. **Month dividers:** for each `monthTicks` after the first, a 1px vertical at `left:pct(index)%`, `background:var(--cw-rule)`.
  3. **NOW line:** if `nowIndex(horizon)!==null`, a 2px vertical `var(--cw-clay)` at `left:pct(nowIndex)%`, with a `"NOW"` label (`font-mono-field 8px var(--cw-clay)`, `top:6px; left:5px`).
- Blocks: render `limited` runs then `open` runs (open on top) via `AvailabilityBlock`.
- If `site` and there are no runs, render a centered `booked all season` (`font-italic-serif 14px var(--cw-ink-faint)`).

- [ ] Step 1: Implement both components.
- [ ] Step 2: `npx tsc --noEmit` passes.
- [ ] Step 3: Commit (`feat(timeline): axis + layered track`).

---

## Task 4: CampgroundTimelineRow (desktop summary + per-site expand)

**Files:**
- Create: `src/components/dashboard/timeline/campground-timeline-row.tsx`

Props: `{ campground, horizon, expanded, onToggleExpand, onRatingChange?, isMobile? }`.

**Summary row** (`grid-template-columns: var(--meta) 1fr; --meta:264px`; `border-bottom:1px dotted var(--cw-rule)`; row is a button — `cursor:pointer; hover:bg color-mix(forest 3%)`):
- **Meta cell** (`padding:16px 26px; border-right:1px solid var(--cw-rule); flex column center`):
  - `cgname` — `font-italic-serif 22px var(--cw-ink)`, prefixed with a clay `★` if any favorite site exists.
  - `cgloc` — `font-body-serif 11px var(--cw-ink-soft)` = `campground.area` (fallback `""`).
  - count line `font-mono-field 10px uppercase letter-spacing:.1em`: `"{openNights} nights open"` (forest) / `"limited only"` (`#7a6212`/`text-cw-mustard`) / `"watching"` (`var(--cw-ink-soft)`), then `· {totalSitesCount ?? siteCount} sites` + a `▾` chevron that rotates 180° when `expanded`.
  - tags line (`cgtags`): tally `★{favN} ◇{worthN} ·{otherN}` (clay/forest/muted, hide zero) + a `★ favorite open` pill (clay outline, `font-mono-field 9px`) when any favorite site has an open run.
- **Track cell:** `TimelineTrack` with `campgroundRuns(horizon, campground)`.

**Per-site rows** (shown when `expanded`): for each site in `Object.values(campground.siteAvailability)` sorted by `TIER_ORDER[siteTier(...)]` then name:
- `grid-template-columns: var(--meta) 1fr; border-bottom:1px dotted var(--cw-rule-soft)`. Row tint: fav → `color-mix(clay 5.5%)`, worth → `color-mix(forest 3.5%)`.
- Meta (`padding:9px 26px 9px 50px; flex row baseline gap:8px; border-right:1px solid var(--cw-rule); position:relative`) with a `::before` connector tick. Contents: tier mark (`TIER_MARK`, colored), `Site {siteName}` (`font-mono-field 12px`), feature (`humanKind(site, isFav)` → `font-italic-serif 15px var(--cw-ink-soft)`, ellipsis).
- Track: `TimelineTrack site` with `{ open: siteOpenRuns(horizon, site), limited: [] }`. **Favorite site open blocks get a clay ring** — pass a `ring` flag to the block (`box-shadow:0 0 0 1.5px var(--cw-clay)` in addition to the normal shadow) when `tier==="fav"`.
- (Optional, since `onRatingChange` exists) a small star toggle in the site meta that calls `onRatingChange(campground.id, siteName, nextTier)` to set fav/worth/other — wire if low-cost; otherwise leave tier display read-only and rely on the modal.

- [ ] Step 1: Implement.
- [ ] Step 2: `npx tsc --noEmit`.
- [ ] Step 3: Commit (`feat(timeline): campground row with per-site expand`).

---

## Task 5: AvailabilityTimeline plate (desktop) + wire into WatchlistSection

**Files:**
- Create: `src/components/dashboard/timeline/availability-timeline.tsx`
- Modify: `src/components/dashboard/watchlist-section/watchlist-section.tsx`

**AvailabilityTimeline** props: `{ rows: ProcessedCampground[]; dateRange: {start:Date; end:Date}; defaultExpandFirst?: boolean; onRatingChange?; isMobile? }`.
- Build `horizon = buildHorizon(dateRange.start, dateRange.end)`.
- Manage `expandedIds: Set<string>` (default: first campground id when `defaultExpandFirst`).
- Plate: `bg-cw-cream; border:1.5px solid var(--cw-ink); box-shadow:8px 8px 0 var(--cw-forest); overflow:hidden`.
- Header (`grid var(--meta) 1fr; border-bottom:2px solid var(--cw-ink); padding:18px 26px 0`): left `hlabel` mono clay "Watchlist · click a row to expand its sites"; right `TimelineAxis`.
- Rows: map `CampgroundTimelineRow`.
- Footer (`border-top:2px solid var(--cw-ink); bg-cw-paper; padding:14px 26px; flex justify-between`): left `font-italic-serif var(--cw-ink-soft)` (e.g. "Updated continuously"); right `font-mono-field clay` "Every 5 min".

**Wire into `watchlist-section.tsx`:**
- Replace the legend strip (lines ~135–148, the "Each tick = one night" block) with the timeline legend: Open / Weekend (Fri/Sat) / Limited (1–2 sites) / Booked + a "Per-site tags ★ ◇ ·" line (see `Availability Timeline.html` `.legend`). Keep it mono/italic per existing style.
- Replace the `watchlistGroups.map(... <WatchlistTable/> ...)` block. When `!isMobile`: render `<AvailabilityTimeline rows={campgroundsByAreas} dateRange={dateRange} defaultExpandFirst onRatingChange={onRatingChange} />` (one plate; keep group headers only if `groupBy !== "all"` by rendering one plate per group, OR drop grouping inside the plate — simplest: one plate over all rows, and gate the group-by control out of the strip for the timeline view). When `isMobile`: render `<MobileTimeline ... />` (Task 6).
- Keep `DatePickerStrip` (it now controls the horizon) and the loading ghost state.

Decision for grouping: render **one plate**; the `groupBy` control still filters/orders rows (region/status/all) by reordering `campgroundsByAreas` before passing in — keep it simple: if `groupBy === "region"`, sort rows by `area`; if `status`, openings-first; `all`, as-is. (No in-plate section headers in v1.)

- [ ] Step 1: Implement `AvailabilityTimeline`.
- [ ] Step 2: Wire `watchlist-section.tsx` (desktop branch + legend).
- [ ] Step 3: `npx tsc --noEmit` + `npx vitest run` (fix any broken watchlist-section tests).
- [ ] Step 4: Commit (`feat(timeline): desktop plate replaces watchlist table`).

---

## Task 6: MobileTimeline (watchlist + detail)

**Files:**
- Create: `src/components/dashboard/timeline/mobile-timeline.tsx`

Reference: `mobile-timeline.jsx`. Two screens controlled by `selectedId: string | null`.

**Watchlist screen** (`selectedId === null`):
- Sticky month axis at top (compressed `TimelineAxis`, smaller type).
- Flat list of campground rows (NOT grouped by tier): each = name (`font-italic-serif`), location (ellipsis, `font-body-serif`), a status pill (reuse the open/quiet semantics; "★ favorite open" when applicable), and a **compressed** `TimelineTrack` (summary runs). Tap → `setSelectedId(cg.id)`.
- Compression: the track already fits to its container width (percent-based), so no horizontal scroll — just ensure the meta column is narrow on mobile (`--meta` ~ name stacks above the track, OR a 2-row layout: meta row then full-width track row). Use the stacked layout: name/loc/pill on one line, full-width track beneath.

**Detail screen** (`selectedId` set):
- Back link (`← Watchlist`).
- Tier-agnostic header: campground title (`font-poster`/`font-italic-serif`), season stat (`{openNights} nights open across {month range}`).
- Full-width `TimelineTrack` (summary).
- **Open windows list:** from `campgroundRuns` open runs (and limited), each row: `rangeLabel` with day-of-week (`Sat May 23 – Mon May 25`), an `incl. weekend` tag when any night in the run is Fri/Sat, nights count, and open vs limited styling.
- **Relevant-month mini-calendars:** only months in the horizon that contain ≥1 open/limited night. For each, a 7-col mini calendar; **shade Fri/Sat columns**; mark open days forest, limited mustard. Hide quiet months and note `+N quiet months hidden`.
- **Per-site rows** (parity): reuse the per-site list from Task 4 (compressed) so mobile reaches site granularity.
- **CTA:** forest "Book on recreation.gov →" linking to `reservationUrl` of the first open site (or the campground page).

- [ ] Step 1: Implement watchlist screen.
- [ ] Step 2: Implement detail screen (open-windows list + mini-calendars + per-site + CTA).
- [ ] Step 3: `npx tsc --noEmit`.
- [ ] Step 4: Commit (`feat(timeline): mobile watchlist + detail`).

---

## Task 7: Component tests

**Files:**
- Create: `src/components/dashboard/timeline/timeline.test.tsx`

- [ ] Step 1: Write tests:
  - `AvailabilityTimeline` renders one row per campground; the first is expanded by default (per-site rows visible).
  - Clicking a collapsed campground row reveals its site rows; clicking again hides them.
  - A favorite site with an open run renders a block carrying the clay ring class/style; a site with no matches renders "booked all season".
  - A block's inline `left`/`width` percentages match `pct(horizon, …)` for a known fixture (positioning sanity).
- [ ] Step 2: Run `npx vitest run src/components/dashboard/timeline/` — Expected PASS.
- [ ] Step 3: Commit (`test(timeline): render + expand + positioning`).

---

## Task 8: Add `forestBright` token

**Files:**
- Modify: `src/app/globals.css`, `src/components/field-notes/cw-tokens.ts`

- [ ] Step 1: In `globals.css` `:root` add `--cw-forest-bright:#3c7a4f;` and in `.dark` a lighter equivalent (e.g. `#5fa377`). Add to `@theme inline`: `--color-cw-forest-bright: var(--cw-forest-bright);`.
- [ ] Step 2: In `cw-tokens.ts` add `forestBright: "var(--cw-forest-bright)"`.
- [ ] Step 3: Confirm Task 2's block uses it for open weekend segments. `npx tsc --noEmit`.
- [ ] Step 4: Commit (`feat(theme): add forest-bright weekend token`). *(Do this before Task 2 if executing strictly in order — it's listed late only to keep the math/components contiguous; reorder freely.)*

---

## Task 9: Reconcile shared helpers + read-only path

**Files:**
- Modify: `src/components/dashboard/watchlist-section/watchlist-row.tsx`
- Check: `src/app/discover` and anywhere `WatchlistSection`/`WatchlistTable` is used read-only.

- [ ] Step 1: Replace the private `reservationUrl` in `watchlist-row.tsx` with an import from `@/lib/timeline` (delete the dup). Keep `humanKind`/`siteDayMatches`/`countOpenInWindow` where they are unless also needed by the timeline (the timeline computes its own; don't over-share).
- [ ] Step 2: Grep for other `WatchlistSection` consumers (e.g. `/discover` read-only). The timeline replaces the desktop/mobile rendering inside `WatchlistSection`, so read-only consumers get the timeline too. Verify the read-only path still renders (no `onRatingChange`/`onEditSettings` required). If `/discover` should keep the old table, gate on a `variant` prop; otherwise let it adopt the timeline.
- [ ] Step 3: `npx tsc --noEmit` + full `npx vitest run`.
- [ ] Step 4: Commit (`refactor(timeline): dedupe reservationUrl, verify read-only path`).

---

## Task 10: Verify + ship

- [ ] Step 1: `npx tsc --noEmit` (clean).
- [ ] Step 2: `npx vitest run` (all pass).
- [ ] Step 3: `npm run lint` (0 warnings) + `npm run format`.
- [ ] Step 4: `npm run build` (succeeds).
- [ ] Step 5: Manual browser check (desktop + mobile widths): rows render over one axis, NOW line correct, weekend two-tone visible, expand works, blocks land on the right dates, mobile detail opens. (Visual fidelity can't be unit-tested.)
- [ ] Step 6: Commit anything outstanding; hand back for push/deploy.

---

## Self-review notes (author)

- Spec coverage: shared axis ✓ (Task 3/5), two-tone weekend ✓ (Task 2/8), by-site expand + tiers + clay ring ✓ (Task 4), summary tally/fav-open ✓ (Task 4), mobile compress + detail + mini-cals ✓ (Task 6), replaces watchlist ✓ (Task 5), horizon from dateRange ✓ (Task 1/5).
- Deliberate deviation: mobile does NOT group campgrounds by tier (per the user's per-site correction) — documented at top.
- Limited semantics defined concretely (≥3 open / 1–2 limited) since the app lacks a per-day scarcity field; flagged as a product choice.
- Per-site "limited" intentionally dropped (a single site night is binary).
