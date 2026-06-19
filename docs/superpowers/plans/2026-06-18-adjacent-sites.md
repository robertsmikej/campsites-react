# Adjacent-Site Group Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when 2+ physically adjacent campsites are simultaneously bookable for a shared stay, and surface it in the notifier email and on the website, toggled per campground with a graded favorite/worthwhile anchor filter.

**Architecture:** One shared pure module (`adjacent-groups.ts`) builds a hybrid adjacency graph (adaptive 2-nearest-within-60m geo edges, with a consecutive-site-number fallback) and finds connected clusters that share a bookable window. A second shared helper (`site-details-cache.ts`) serves site coordinates from KV to both the website's availability route and the notifier. Groups are computed server-side and attached to the per-user availability snapshot, so the card pill, map highlight, and email all read the same result.

**Tech Stack:** Next.js (App Router) on Cloudflare Workers, TypeScript, Vitest, Leaflet, Cloudflare KV. Notifier is a separate Worker sharing code from `next/src/lib`.

## Global Constraints

- TypeScript strict; use `===`/`!==` (except `== null`). Match existing file style.
- Geo adjacency: each site links to its **2 nearest neighbors**, edge only if distance **≤ 60 m**, and only when both sites share the same `loop` (or loop is unknown on either side).
- Number fallback applies only when **at least one** site in a pair lacks coordinates: consecutive integer site numbers, same `loop` when known.
- Minimum group size is **2** (fixed). The actual count is always displayed.
- Anchor scopes reuse `NotifyScope` semantics: `favorites` ⊂ `worthwhile` ⊂ `all`. `Campground.adjacencyAnchor` absent = feature OFF for that campground.
- Group alerts are **additive** — they never suppress per-site `notifyScope` alerts.
- Notifier CI is NOT covered by the `next/` pipeline. After any `notifier/` change, run `cd notifier && npx tsc --noEmit && npx vitest run` manually.
- Commit after each task. Do not `git push` (CampWatch deploys on push to any branch) unless explicitly told.
- Work on `main` is acceptable for CampWatch iteration.

---

## File Structure

**New files**
- `next/src/lib/adjacent-groups.ts` — pure detection engine + `AdjacentGroup`, `AdjacencySite` types.
- `next/src/lib/adjacent-groups.test.ts`
- `next/src/lib/site-details-cache.ts` — `KvLike` interface, `kvNamespaceLike()`, `getSiteDetailsCached()`.
- `next/src/lib/site-details-cache.test.ts`
- `next/src/components/campground/adjacent-badge.tsx` — card pill.
- `next/src/components/campground/adjacent-badge.test.tsx`

**Modified files**
- `next/src/lib/site-details.ts` — add `loop?: string` to `SiteDetail`, parse it.
- `next/src/app/api/campgrounds/[id]/site-details/route.ts` — use the shared cache helper.
- `next/src/lib/recgov/rest-kv.ts` — make `getJson`/`put` public (satisfy `KvLike`).
- `next/src/types/campground.ts` — `Campground.adjacencyAnchor?`, `ProcessedCampground.adjacentGroups?`.
- `next/src/lib/recgov/cache.ts` — `SnapshotCampground.adjacentGroups?`.
- `next/src/app/api/availability/route.ts` — compute + attach groups in `buildSnapshot`.
- `next/src/components/campground.tsx` — render `AdjacentBadge`.
- `next/src/components/site-config-dialog/campground-editor.tsx` — `adjacencyAnchor` control.
- `next/src/components/site-config-dialog/serialize.ts` — persist `adjacencyAnchor`.
- `next/src/components/dashboard/map-modal/{campground-map-modal,site-list,site-map}.tsx` — cluster highlight.
- `notifier/check.ts` — compute groups, dedup, include in email.
- `notifier/lib/email.ts` — adjacent-openings section + subject lead.

---

## Task 1: Add `loop` to SiteDetail

**Files:**
- Modify: `next/src/lib/site-details.ts`
- Test: `next/src/lib/site-details.test.ts`

**Interfaces:**
- Produces: `SiteDetail.loop?: string` (trimmed rec.gov `loop`, omitted when blank).

- [ ] **Step 1: Write the failing test**

Add to `next/src/lib/site-details.test.ts`:

```ts
it("captures the trimmed loop name", () => {
    const site = parseCampsite({ name: "012", loop: "OUTLET CAMPGROUND ", latitude: "44.1", longitude: "-114.9" });
    expect(site?.loop).toBe("OUTLET CAMPGROUND");
});

it("omits loop when blank", () => {
    const site = parseCampsite({ name: "012", loop: "  " });
    expect(site?.loop).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd next && npx vitest run src/lib/site-details.test.ts`
Expected: FAIL (`loop` is undefined / property does not exist).

- [ ] **Step 3: Implement**

In `next/src/lib/site-details.ts`, add to the `SiteDetail` interface (after `id`):

```ts
    loop?: string;
```

Add `loop?: string;` to the `RawCampsite` interface. In `parseCampsite`, before the `return`, compute:

```ts
    const loop = (c.loop ?? "").trim();
```

Add to the returned object (next to `id`):

```ts
        ...(loop ? { loop } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd next && npx vitest run src/lib/site-details.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/site-details.ts next/src/lib/site-details.test.ts
git commit -m "feat(site-details): capture loop name for adjacency"
```

---

## Task 2: Adjacency graph builder

**Files:**
- Create: `next/src/lib/adjacent-groups.ts`
- Test: `next/src/lib/adjacent-groups.test.ts`

**Interfaces:**
- Consumes: `SiteDetail` shape (uses `id`, `lat`, `lng`, `loop`).
- Produces:
  - `interface AdjacencySite { id: string; lat: number | null; lng: number | null; loop?: string }`
  - `function buildAdjacencyEdges(sites: AdjacencySite[]): Map<string, Set<string>>` — undirected neighbor map (every site id is a key, value is its neighbor ids).
  - `const GEO_CAP_METERS = 60`, `const NEAREST_K = 2`.

- [ ] **Step 1: Write the failing tests**

Create `next/src/lib/adjacent-groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAdjacencyEdges, type AdjacencySite } from "./adjacent-groups";

// ~10m of latitude ≈ 0.00009 deg; ~50m ≈ 0.00045 deg; ~80m ≈ 0.00072 deg.
const at = (id: string, latOffset: number, loop?: string): AdjacencySite => ({
    id,
    lat: 44.1 + latOffset,
    lng: -114.9,
    loop,
});

describe("buildAdjacencyEdges — geo", () => {
    it("links a site to its nearest neighbor within the cap", () => {
        const edges = buildAdjacencyEdges([at("A", 0), at("B", 0.00045)]); // ~50m
        expect(edges.get("A")?.has("B")).toBe(true);
        expect(edges.get("B")?.has("A")).toBe(true);
    });

    it("does not link sites beyond the 60m cap", () => {
        const edges = buildAdjacencyEdges([at("A", 0), at("B", 0.0009)]); // ~100m
        expect(edges.get("A")?.size ?? 0).toBe(0);
    });

    it("links only the 2 nearest neighbors, not a farther in-cap site", () => {
        // A at 0; B,C,D at ~20,~40,~55m — all within cap, but only the 2 nearest are kept.
        const edges = buildAdjacencyEdges([
            at("A", 0),
            at("B", 0.00018),
            at("C", 0.00036),
            at("D", 0.0005),
        ]);
        expect(edges.get("A")?.has("B")).toBe(true);
        expect(edges.get("A")?.has("C")).toBe(true);
        // D is A's 3rd-nearest, so A does not originate an edge to D; but D may still
        // be linked symmetrically if A is among D's 2 nearest — assert A->D absent only
        // when D has 2 closer neighbors than A. Here C and B are closer to D than A, so:
        expect(edges.get("A")?.has("D")).toBe(false);
    });

    it("does not link across different loops", () => {
        const edges = buildAdjacencyEdges([at("A", 0, "Loop1"), at("B", 0.00045, "Loop2")]);
        expect(edges.get("A")?.size ?? 0).toBe(0);
    });

    it("links within the same loop", () => {
        const edges = buildAdjacencyEdges([at("A", 0, "Loop1"), at("B", 0.00045, "Loop1")]);
        expect(edges.get("A")?.has("B")).toBe(true);
    });
});

describe("buildAdjacencyEdges — number fallback", () => {
    const noCoord = (id: string, loop?: string): AdjacencySite => ({ id, lat: null, lng: null, loop });

    it("links consecutive site numbers when coords are missing", () => {
        const edges = buildAdjacencyEdges([noCoord("012"), noCoord("013")]);
        expect(edges.get("012")?.has("013")).toBe(true);
    });

    it("does not link non-consecutive numbers", () => {
        const edges = buildAdjacencyEdges([noCoord("012"), noCoord("015")]);
        expect(edges.get("012")?.size ?? 0).toBe(0);
    });

    it("ignores ids with no parseable integer", () => {
        const edges = buildAdjacencyEdges([noCoord("Group Site"), noCoord("Cabin")]);
        expect(edges.get("Group Site")?.size ?? 0).toBe(0);
    });

    it("does not link consecutive numbers across loops", () => {
        const edges = buildAdjacencyEdges([noCoord("012", "L1"), noCoord("013", "L2")]);
        expect(edges.get("012")?.size ?? 0).toBe(0);
    });

    it("uses number fallback when only one site has coords", () => {
        const edges = buildAdjacencyEdges([
            { id: "012", lat: 44.1, lng: -114.9 },
            { id: "013", lat: null, lng: null },
        ]);
        expect(edges.get("012")?.has("013")).toBe(true);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/lib/adjacent-groups.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `buildAdjacencyEdges`**

Create `next/src/lib/adjacent-groups.ts`:

```ts
export interface AdjacencySite {
    id: string;
    lat: number | null;
    lng: number | null;
    loop?: string;
}

export const GEO_CAP_METERS = 60;
export const NEAREST_K = 2;

function haversineMeters(a: AdjacencySite, b: AdjacencySite): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad((b.lat as number) - (a.lat as number));
    const dLng = toRad((b.lng as number) - (a.lng as number));
    const lat1 = toRad(a.lat as number);
    const lat2 = toRad(b.lat as number);
    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function sameLoopOrUnknown(a: AdjacencySite, b: AdjacencySite): boolean {
    if (!a.loop || !b.loop) return true;
    return a.loop === b.loop;
}

/** Trailing integer of a site id, e.g. "012" -> 12, "A12" -> 12, "Cabin" -> null. */
function siteNumber(id: string): number | null {
    const m = id.match(/(\d+)\s*$/);
    return m ? Number.parseInt(m[1] as string, 10) : null;
}

function hasCoords(s: AdjacencySite): boolean {
    return s.lat != null && s.lng != null;
}

function addEdge(edges: Map<string, Set<string>>, a: string, b: string): void {
    (edges.get(a) as Set<string>).add(b);
    (edges.get(b) as Set<string>).add(a);
}

/**
 * Undirected adjacency neighbor-map over all sites. Geo edges use an adaptive
 * 2-nearest-neighbor rule capped at GEO_CAP_METERS; the number fallback links
 * consecutive site numbers whenever at least one site in the pair lacks coords.
 * Both respect the same-loop guard.
 */
export function buildAdjacencyEdges(sites: AdjacencySite[]): Map<string, Set<string>> {
    const edges = new Map<string, Set<string>>();
    for (const s of sites) edges.set(s.id, new Set<string>());

    // Geo: each coord-bearing site originates edges to its 2 nearest coord-bearing
    // neighbors within the cap and same loop. Symmetric via addEdge.
    const geoSites = sites.filter(hasCoords);
    for (const a of geoSites) {
        const candidates = geoSites
            .filter((b) => b.id !== a.id && sameLoopOrUnknown(a, b))
            .map((b) => ({ b, d: haversineMeters(a, b) }))
            .filter((x) => x.d <= GEO_CAP_METERS)
            .sort((x, y) => x.d - y.d)
            .slice(0, NEAREST_K);
        for (const { b } of candidates) addEdge(edges, a.id, b.id);
    }

    // Number fallback: only for pairs where at least one site lacks coords.
    for (let i = 0; i < sites.length; i++) {
        for (let j = i + 1; j < sites.length; j++) {
            const a = sites[i] as AdjacencySite;
            const b = sites[j] as AdjacencySite;
            if (hasCoords(a) && hasCoords(b)) continue;
            if (!sameLoopOrUnknown(a, b)) continue;
            const na = siteNumber(a.id);
            const nb = siteNumber(b.id);
            if (na != null && nb != null && Math.abs(na - nb) === 1) addEdge(edges, a.id, b.id);
        }
    }

    return edges;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/lib/adjacent-groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/adjacent-groups.ts next/src/lib/adjacent-groups.test.ts
git commit -m "feat(adjacent-groups): hybrid adjacency edge builder"
```

---

## Task 3: Shared-window matching + anchor filter

**Files:**
- Modify: `next/src/lib/adjacent-groups.ts`
- Test: `next/src/lib/adjacent-groups.test.ts`

**Interfaces:**
- Consumes: `buildAdjacencyEdges`, `AdjacencySite`; `findConsecutiveAvailableRanges` and `getAllDatesInRange` from `./recgov/match-detection`; `stayOverlapsBlackout` from `./blackout`; `NotifyScope`, `BlackoutRange` from `../types/campground`.
- Produces:
  - `interface AdjacentGroup { campgroundId: string; siteIds: string[]; siteNames: string[]; from: string; to: string; nights: number; anchorTier: "favorites" | "worthwhile" | "none" }`
  - `interface AdjacentGroupInput { campgroundId: string; sites: AdjacencySite[]; availableNightsByName: Record<string, string[]>; tiers: { favorites: string[]; worthwhile: string[] }; settings: { stayLengths: number[]; validStartDays: string[]; blackoutDates?: BlackoutRange[] }; anchorScope: NotifyScope }`
  - `function findAdjacentGroups(input: AdjacentGroupInput): AdjacentGroup[]`

- [ ] **Step 1: Write the failing tests**

Append to `next/src/lib/adjacent-groups.test.ts`:

```ts
import { findAdjacentGroups, type AdjacentGroupInput } from "./adjacent-groups";

const baseSettings = { stayLengths: [2], validStartDays: ["Friday", "Saturday"], blackoutDates: [] };

// Helper: build availability of consecutive nights starting at a given Fri.
const nights = (...days: string[]) => days;

function input(over: Partial<AdjacentGroupInput>): AdjacentGroupInput {
    return {
        campgroundId: "cg1",
        sites: [],
        availableNightsByName: {},
        tiers: { favorites: [], worthwhile: [] },
        settings: baseSettings,
        anchorScope: "all",
        ...over,
    };
}

describe("findAdjacentGroups", () => {
    // 2026-06-19 is a Friday; nights 06-19 & 06-20 form a 2-night Fri stay (to=06-21).
    const fri = "2026-06-19";
    const sat = "2026-06-20";
    const checkout = "2026-06-21";

    it("emits a group when two adjacent sites share a bookable window", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ siteIds: ["012", "013"], from: fri, to: checkout, nights: 2 });
    });

    it("does not emit when the shared window is too short for the stay length", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(sat) }, // only Sat overlaps
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not emit for non-adjacent sites even if both open", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "020", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "020": nights(fri, sat) },
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not bridge a closed middle site (A-B-C chain, B closed)", () => {
        const groups = findAdjacentGroups(input({
            sites: [
                { id: "012", lat: null, lng: null },
                { id: "013", lat: null, lng: null },
                { id: "014", lat: null, lng: null },
            ],
            availableNightsByName: { "012": nights(fri, sat), "014": nights(fri, sat) }, // 013 closed
        }));
        expect(groups).toHaveLength(0);
    });

    it("emits a 3-site group when the whole chain is open", () => {
        const groups = findAdjacentGroups(input({
            sites: [
                { id: "012", lat: null, lng: null },
                { id: "013", lat: null, lng: null },
                { id: "014", lat: null, lng: null },
            ],
            availableNightsByName: {
                "012": nights(fri, sat), "013": nights(fri, sat), "014": nights(fri, sat),
            },
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]?.siteIds).toEqual(["012", "013", "014"]);
    });

    it("rejects a group with no favorite when anchorScope is favorites", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            anchorScope: "favorites",
        }));
        expect(groups).toHaveLength(0);
    });

    it("accepts and tags a group containing a favorite when anchorScope is favorites", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            tiers: { favorites: ["013"], worthwhile: [] },
            anchorScope: "favorites",
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]?.anchorTier).toBe("favorites");
    });

    it("excludes windows overlapping a blackout range", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            settings: { ...baseSettings, blackoutDates: [{ from: fri, to: sat }] },
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not emit for a window starting on a disallowed day", () => {
        const sun = "2026-06-21";
        const mon = "2026-06-22";
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(sun, mon), "013": nights(sun, mon) },
        }));
        expect(groups).toHaveLength(0); // Sunday start not in validStartDays
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/lib/adjacent-groups.test.ts`
Expected: FAIL (`findAdjacentGroups` not exported).

- [ ] **Step 3: Implement `findAdjacentGroups`**

Append to `next/src/lib/adjacent-groups.ts`:

```ts
import { findConsecutiveAvailableRanges, getAllDatesInRange } from "./recgov/match-detection";
import { stayOverlapsBlackout } from "./blackout";
import type { NotifyScope, BlackoutRange } from "../types/campground";

export interface AdjacentGroup {
    campgroundId: string;
    siteIds: string[];
    siteNames: string[];
    from: string;
    to: string;
    nights: number;
    anchorTier: "favorites" | "worthwhile" | "none";
}

export interface AdjacentGroupInput {
    campgroundId: string;
    sites: AdjacencySite[];
    /** Open nights per site id (YYYY-MM-DD), keyed exactly by AdjacencySite.id. */
    availableNightsByName: Record<string, string[]>;
    tiers: { favorites: string[]; worthwhile: string[] };
    settings: { stayLengths: number[]; validStartDays: string[]; blackoutDates?: BlackoutRange[] };
    anchorScope: NotifyScope;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const startWeekday = (iso: string): string => WEEKDAYS[new Date(iso).getUTCDay()] as string;

/** Connected components (each a sorted id list) of a neighbor-map restricted to `allowed`. */
function components(edges: Map<string, Set<string>>, allowed: Set<string>): string[][] {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const start of allowed) {
        if (seen.has(start)) continue;
        const stack = [start];
        const comp: string[] = [];
        seen.add(start);
        while (stack.length) {
            const cur = stack.pop() as string;
            comp.push(cur);
            for (const nb of edges.get(cur) ?? []) {
                if (allowed.has(nb) && !seen.has(nb)) {
                    seen.add(nb);
                    stack.push(nb);
                }
            }
        }
        out.push(comp.sort());
    }
    return out;
}

function tierOf(id: string, fav: Set<string>, worth: Set<string>): AdjacentGroup["anchorTier"] {
    if (fav.has(id)) return "favorites";
    if (worth.has(id)) return "worthwhile";
    return "none";
}

function passesAnchor(scope: NotifyScope, hasFav: boolean, hasWorth: boolean): boolean {
    if (scope === "all") return true;
    if (scope === "worthwhile") return hasFav || hasWorth;
    return hasFav; // "favorites"
}

export function findAdjacentGroups(input: AdjacentGroupInput): AdjacentGroup[] {
    const { campgroundId, sites, availableNightsByName, tiers, settings, anchorScope } = input;
    const edges = buildAdjacencyEdges(sites);
    const fav = new Set(tiers.favorites);
    const worth = new Set(tiers.worthwhile);
    const nightSets = new Map<string, Set<string>>();
    for (const s of sites) nightSets.set(s.id, new Set(availableNightsByName[s.id] ?? []));

    // Candidate windows: every site's own consecutive bookable ranges, per stay length.
    const windowKeys = new Set<string>();
    const windows: Array<{ from: string; to: string; nights: number }> = [];
    for (const s of sites) {
        const dates = [...(nightSets.get(s.id) ?? [])].sort();
        for (const length of settings.stayLengths) {
            for (const [from, to] of findConsecutiveAvailableRanges(dates, length)) {
                const key = `${from}:${to}`;
                if (windowKeys.has(key)) continue;
                windowKeys.add(key);
                windows.push({ from, to, nights: length });
            }
        }
    }

    const results: AdjacentGroup[] = [];
    for (const w of windows) {
        if (!settings.validStartDays.includes(startWeekday(w.from))) continue;
        if (stayOverlapsBlackout(w.from, w.to, settings.blackoutDates)) continue;
        // getAllDatesInRange is inclusive of both ends; `to` is the checkout day, so drop it.
        const stayNights = getAllDatesInRange(w.from, w.to).slice(0, -1);
        const open = new Set<string>();
        for (const s of sites) {
            const ns = nightSets.get(s.id) as Set<string>;
            if (stayNights.every((d) => ns.has(d))) open.add(s.id);
        }
        for (const comp of components(edges, open)) {
            if (comp.length < 2) continue;
            const hasFav = comp.some((id) => fav.has(id));
            const hasWorth = comp.some((id) => worth.has(id));
            if (!passesAnchor(anchorScope, hasFav, hasWorth)) continue;
            const anchorTier = hasFav ? "favorites" : hasWorth ? "worthwhile" : "none";
            results.push({
                campgroundId,
                siteIds: comp,
                siteNames: comp,
                from: w.from,
                to: w.to,
                nights: w.nights,
                anchorTier,
            });
        }
    }

    // Prefer the longest window per identical site set (drop sub-window duplicates).
    results.sort((a, b) => b.nights - a.nights);
    const kept: AdjacentGroup[] = [];
    const claimed = new Set<string>();
    for (const g of results) {
        const id = g.siteIds.join(",");
        if (claimed.has(id)) continue;
        claimed.add(id);
        kept.push(g);
    }
    return kept;
}
```

Note: `siteIds` and `siteNames` are identical here because `AdjacencySite.id` is the site name/number; the two fields are kept distinct in the type for future divergence and for display clarity in consumers.

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/lib/adjacent-groups.test.ts`
Expected: PASS (all tests from Tasks 2 and 3).

- [ ] **Step 5: Commit**

```bash
git add next/src/lib/adjacent-groups.ts next/src/lib/adjacent-groups.test.ts
git commit -m "feat(adjacent-groups): shared-window matching with anchor filter"
```

---

## Task 4: Shared site-details cache helper

**Files:**
- Create: `next/src/lib/site-details-cache.ts`
- Test: `next/src/lib/site-details-cache.test.ts`
- Modify: `next/src/lib/recgov/rest-kv.ts` (make `getJson`/`put` public)
- Modify: `next/src/app/api/campgrounds/[id]/site-details/route.ts` (use the helper)

**Interfaces:**
- Consumes: `parseCampsite`, `SiteDetail` from `./site-details`.
- Produces:
  - `interface KvLike { getJson<T>(key: string): Promise<T | null>; put(key: string, value: unknown, ttlSeconds: number): Promise<void> }`
  - `function kvNamespaceLike(kv: { get(key: string, type: "json"): Promise<unknown>; put(key: string, value: string, opts: { expirationTtl: number }): Promise<void> }): KvLike`
  - `function getSiteDetailsCached(facilityId: string, kv: KvLike, fetchImpl?: typeof fetch): Promise<SiteDetail[]>`
  - `const SITE_DETAILS_TTL_SECONDS = 60 * 60 * 24 * 7`

- [ ] **Step 1: Write the failing test**

Create `next/src/lib/site-details-cache.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getSiteDetailsCached, type KvLike } from "./site-details-cache";

function fakeKv(initial: Record<string, unknown> = {}): KvLike & { store: Record<string, unknown> } {
    const store: Record<string, unknown> = { ...initial };
    return {
        store,
        getJson: async <T>(key: string) => (store[key] ?? null) as T | null,
        put: async (key: string, value: unknown) => { store[key] = value; },
    };
}

const okResponse = (campsites: unknown[]) =>
    ({ ok: true, json: async () => ({ campsites }) }) as unknown as Response;

describe("getSiteDetailsCached", () => {
    it("returns cached details without fetching", async () => {
        const kv = fakeKv({ "site-details:232358": [{ id: "012", campsiteId: "1", lat: null, lng: null, type: "tent", rating: null, reviews: 0, cell: null, amenities: {} }] });
        const fetchImpl = vi.fn();
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites).toHaveLength(1);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("fetches, parses, and stores on a cold cache", async () => {
        const kv = fakeKv();
        const fetchImpl = vi.fn().mockResolvedValue(
            okResponse([{ name: "012", latitude: "44.1", longitude: "-114.9", loop: "L1" }]),
        );
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites[0]?.id).toBe("012");
        expect(kv.store["site-details:232358"]).toBeDefined();
    });

    it("returns [] and does not cache on fetch failure", async () => {
        const kv = fakeKv();
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites).toEqual([]);
        expect(kv.store["site-details:232358"]).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/lib/site-details-cache.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

Create `next/src/lib/site-details-cache.ts`:

```ts
import { parseCampsite, type SiteDetail } from "./site-details";

export const SITE_DETAILS_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const cacheKey = (id: string) => `site-details:${id}`;

export interface KvLike {
    getJson<T>(key: string): Promise<T | null>;
    put(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/** Adapt a Cloudflare KVNamespace to KvLike. */
export function kvNamespaceLike(kv: {
    get(key: string, type: "json"): Promise<unknown>;
    put(key: string, value: string, opts: { expirationTtl: number }): Promise<void>;
}): KvLike {
    return {
        getJson: async <T>(key: string) => (await kv.get(key, "json")) as T | null,
        put: async (key: string, value: unknown, ttlSeconds: number) =>
            kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }),
    };
}

/**
 * Site details (incl. lat/lng/loop) for a rec.gov facility, served from KV.
 * On a cold cache, fetches the campsites endpoint once and stores for 7 days.
 * Network/parse failure → [] (caller degrades to number-only adjacency).
 */
export async function getSiteDetailsCached(
    facilityId: string,
    kv: KvLike,
    fetchImpl: typeof fetch = fetch,
): Promise<SiteDetail[]> {
    const cached = await kv.getJson<SiteDetail[]>(cacheKey(facilityId));
    if (cached) return cached;

    const url = `https://www.recreation.gov/api/search/campsites?fq=asset_id%3A${facilityId}&size=1000&include_non_site_specific_campsites=true`;
    let sites: SiteDetail[] = [];
    try {
        const r = await fetchImpl(url, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (CampWatch)" },
        });
        if (r.ok) {
            const data = (await r.json()) as { campsites?: unknown[] };
            sites = (data.campsites ?? []).map(parseCampsite).filter((s): s is SiteDetail => s !== null);
        }
    } catch {
        // fall through to []
    }
    if (sites.length > 0) await kv.put(cacheKey(facilityId), sites, SITE_DETAILS_TTL_SECONDS);
    return sites;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/lib/site-details-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Make RestKvAdapter satisfy KvLike**

In `next/src/lib/recgov/rest-kv.ts`, change `private async getJson<T>` to `async getJson<T>` and `private async put` to `async put`. (Signatures already match `KvLike`: `getJson<T>(key)` and `put(key, value, ttlSeconds)`.)

- [ ] **Step 6: Refactor the site-details route to use the helper**

Replace the body of `getHandler` in `next/src/app/api/campgrounds/[id]/site-details/route.ts` so the fetch/cache logic comes from the helper:

```ts
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { getSiteDetailsCached, kvNamespaceLike } from "@/lib/site-details-cache";

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }
    const sites = await getSiteDetailsCached(id, kvNamespaceLike(getKv()));
    return withCors(jsonResponse({ sites }));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/site-details");
```

- [ ] **Step 7: Run the affected suites**

Run: `cd next && npx vitest run src/lib/site-details-cache.test.ts src/lib/recgov/rest-kv.test.ts "src/app/api/campgrounds/[id]/site-details/route.test.ts"`
Expected: PASS. If the route test asserted on internal fetch/caching that moved into the helper, update it to assert the response shape (`{ sites }`) and a cache hit via a stubbed KV; keep coverage equivalent.

- [ ] **Step 8: Commit**

```bash
git add next/src/lib/site-details-cache.ts next/src/lib/site-details-cache.test.ts next/src/lib/recgov/rest-kv.ts "next/src/app/api/campgrounds/[id]/site-details/route.ts" "next/src/app/api/campgrounds/[id]/site-details/route.test.ts"
git commit -m "feat(site-details-cache): shared KV-backed coord cache helper"
```

---

## Task 5: Type changes — config field + snapshot/processed fields

**Files:**
- Modify: `next/src/types/campground.ts`
- Modify: `next/src/lib/recgov/cache.ts`

**Interfaces:**
- Consumes: `AdjacentGroup` from `../adjacent-groups` (re-exported via types for consumer convenience).
- Produces: `Campground.adjacencyAnchor?: NotifyScope`; `SnapshotCampground.adjacentGroups?: AdjacentGroup[]`; `ProcessedCampground.adjacentGroups?: AdjacentGroup[]`.

**No carry-through code is needed.** The dashboard hook (`next/src/hooks/use-campgrounds-data.ts:56`) casts `snapshot.campgrounds` directly to `ProcessedCampground[]`, and the two downstream transforms preserve all fields: `overlayConfigRatings` spreads `...cg`, and `formatGroupsByFavorites` deep-clones via `JSON.parse(JSON.stringify(...))`. So `adjacentGroups` set on `SnapshotCampground` in Task 6 flows to `ProcessedCampground` automatically. This task is type declarations only.

- [ ] **Step 1: Add the config + processed fields**

In `next/src/types/campground.ts`:
- Add to the `Campground` interface (near `notifyScope`):

```ts
    /** Adjacent-site group alerts. Absent = off. Anchor scope mirrors NotifyScope:
     *  "favorites" requires a favorite in the group, "worthwhile" a fav-or-worthwhile,
     *  "all" no anchor requirement. */
    adjacencyAnchor?: NotifyScope;
```

- Add the import and re-export at the top:

```ts
import type { AdjacentGroup } from "../lib/adjacent-groups";
export type { AdjacentGroup };
```

- Add to `ProcessedCampground`:

```ts
    adjacentGroups?: AdjacentGroup[];
```

In `next/src/lib/recgov/cache.ts`, add to `SnapshotCampground`:

```ts
    adjacentGroups?: import("../adjacent-groups").AdjacentGroup[];
```

- [ ] **Step 2: Typecheck**

Run: `cd next && npx tsc --noEmit`
Expected: no errors. (No runtime test here — the fields are plumbed and exercised in Tasks 6, 8, 9.)

- [ ] **Step 3: Commit**

```bash
git add next/src/types/campground.ts next/src/lib/recgov/cache.ts
git commit -m "feat: adjacencyAnchor config + adjacentGroups types"
```

---

## Task 6: Compute groups server-side in the availability snapshot

**Files:**
- Modify: `next/src/app/api/availability/route.ts`
- Test: `next/src/app/api/availability/route.test.ts`

**Interfaces:**
- Consumes: `findAdjacentGroups`, `AdjacencySite` from `@/lib/adjacent-groups`; `getSiteDetailsCached`, `kvNamespaceLike` from `@/lib/site-details-cache`; `getKv` from `@/lib/cloudflare`.
- Produces: each `SnapshotCampground` with `adjacencyAnchor` set carries `adjacentGroups`.

- [ ] **Step 1: Write the failing test**

In `next/src/app/api/availability/route.test.ts`, add a test that a campground with `adjacencyAnchor: "all"` and two adjacent open sites yields `adjacentGroups`. Follow the file's existing harness for building config + stubbing KV/rec.gov. Stub `getSiteDetailsCached` (or the KV `site-details:` entry) to return two coordless consecutive sites `"012"`,`"013"`, and availability with a shared Fri/Sat window. Assert the returned snapshot campground has `adjacentGroups.length === 1`.

```ts
it("attaches adjacentGroups when adjacencyAnchor is set", async () => {
    // ...build a user config with one campground: adjacencyAnchor "all",
    //    sites 012 & 013 both open Fri+Sat; seed KV "site-details:<id>" with the two sites.
    const res = await GET(buildRequest(/* authed session */));
    const snap = await res.json();
    const cg = snap.campgrounds[0];
    expect(cg.adjacentGroups).toHaveLength(1);
    expect(cg.adjacentGroups[0].siteIds).toEqual(["012", "013"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/app/api/availability/route.test.ts`
Expected: FAIL (`adjacentGroups` undefined).

- [ ] **Step 3: Implement in `buildSnapshot`**

Add imports at the top of `next/src/app/api/availability/route.ts`:

```ts
import { findAdjacentGroups, type AdjacencySite } from "@/lib/adjacent-groups";
import { getSiteDetailsCached, kvNamespaceLike } from "@/lib/site-details-cache";
import { getKv } from "@/lib/cloudflare";
```

Inside `buildSnapshot`, after `sitesWithMatches` is built and before `results.push`, compute groups when enabled:

```ts
        let adjacentGroups;
        if (cg.adjacencyAnchor) {
            const details = await getSiteDetailsCached(cg.id, kvNamespaceLike(getKv()));
            const sitesForGraph: AdjacencySite[] = details.map((d) => ({
                id: d.id,
                lat: d.lat,
                lng: d.lng,
                ...(d.loop ? { loop: d.loop } : {}),
            }));
            const availableNightsByName: Record<string, string[]> = {};
            for (const site of Object.values(sites)) {
                availableNightsByName[site.siteName] = site.dates ?? [];
            }
            adjacentGroups = findAdjacentGroups({
                campgroundId: cg.id,
                sites: sitesForGraph,
                availableNightsByName,
                tiers: { favorites: cg.sites?.favorites ?? [], worthwhile: cg.sites?.worthwhile ?? [] },
                settings: {
                    stayLengths: effectiveSettings.stayLengths,
                    validStartDays: effectiveSettings.validStartDays,
                    blackoutDates: config.globalSettings.blackoutDates,
                },
                anchorScope: cg.adjacencyAnchor,
            });
        }
        results.push({
            ...cg,
            siteAvailability: sitesWithMatches,
            totalSitesCount,
            ...(adjacentGroups && adjacentGroups.length > 0 ? { adjacentGroups } : {}),
        });
```

Note: groups are computed from the full `sites` map (all sites' `dates`), not `sitesWithMatches`, because a site can be part of a shared window even when its own per-site `matches` were filtered out. `availableNightsByName` is keyed by `siteName`, matching `AdjacencySite.id` (== rec.gov site name/number).

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/app/api/availability/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd next && npx tsc --noEmit`

```bash
git add next/src/app/api/availability/route.ts next/src/app/api/availability/route.test.ts
git commit -m "feat(availability): compute adjacent groups in the snapshot"
```

---

## Task 7: Per-campground config control

**Files:**
- Modify: `next/src/components/site-config-dialog/campground-editor.tsx`
- Modify: `next/src/components/site-config-dialog/serialize.ts`
- Test: `next/src/components/site-config-dialog/serialize.test.ts`

**Interfaces:**
- Consumes: `NotifyScope`; existing `SegmentedControl`, `FieldLabel` primitives; `sanitizeCampground` / `createEmptyCampground` from `./serialize`.
- Produces: editor renders an "Adjacent-site alerts" control bound to `adjacencyAnchor`; `sanitizeCampground` persists it.

**Round-trip is automatic for everything except the write-out.** `EditableCampground extends Campground` (so it gains `adjacencyAnchor` from Task 5 with no edit), and `toEditableCampground` already spreads `...cg` (carries it into the editor). Only `sanitizeCampground` (Campground out) needs an explicit line.

- [ ] **Step 1: Write the failing serialize test**

In `next/src/components/site-config-dialog/serialize.test.ts`, add (importing `sanitizeCampground` and `createEmptyCampground` as the existing tests in this file do):

```ts
it("persists adjacencyAnchor when set", () => {
    const out = sanitizeCampground({ ...createEmptyCampground(), adjacencyAnchor: "worthwhile" });
    expect(out.adjacencyAnchor).toBe("worthwhile");
});

it("omits adjacencyAnchor when unset", () => {
    const out = sanitizeCampground(createEmptyCampground());
    expect(out.adjacencyAnchor).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/components/site-config-dialog/serialize.test.ts`
Expected: FAIL (`adjacencyAnchor` undefined on output).

- [ ] **Step 3: Persist in `sanitizeCampground`**

In `next/src/components/site-config-dialog/serialize.ts`, in the object built by `sanitizeCampground` (next to the existing `notifyScope` conditional spread), add:

```ts
        ...(campground.adjacencyAnchor ? { adjacencyAnchor: campground.adjacencyAnchor } : {}),
```

- [ ] **Step 4: Run to verify serialize passes**

Run: `cd next && npx vitest run src/components/site-config-dialog/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the editor control**

In `next/src/components/site-config-dialog/campground-editor.tsx`, after the "Email me when" / `notifyScope` `SegmentedControl` block, add an analogous block. Mirror the existing notifyScope markup exactly (clear button + `SegmentedControl<NotifyScope>`):

```tsx
                    <div /* same wrapper className as the notifyScope row */>
                        <FieldLabel>Adjacent-site alerts</FieldLabel>
                        {campground.adjacencyAnchor && (
                            <button
                                type="button"
                                /* same "clear" styling/handler pattern as notifyScope's clear */
                                onClick={() => onFieldChange("adjacencyAnchor", undefined)}
                            >
                                Off
                            </button>
                        )}
                    </div>
                    <SegmentedControl<NotifyScope>
                        /* same options prop shape as the notifyScope control */
                        options={[
                            { value: "favorites", label: "Favorite anchor" },
                            { value: "worthwhile", label: "Fav/Worthwhile" },
                            { value: "all", label: "Any pair" },
                        ]}
                        value={campground.adjacencyAnchor}
                        onChange={(value) => onFieldChange("adjacencyAnchor", value)}
                    />
                    <Hint>Alerts when 2+ sites right next to each other open for the same dates. Off = no adjacency alerts.</Hint>
```

Match the precise prop names (`options`/`value`/`onChange` or whatever the existing `SegmentedControl` uses — copy from the `notifyScope` usage in the same file) and the wrapper/clear-button classes from the adjacent `notifyScope` block.

- [ ] **Step 6: Typecheck + verify the dialog renders**

Run: `cd next && npx tsc --noEmit`
Then run the existing site-config-dialog test suite:
Run: `cd next && npx vitest run src/components/site-config-dialog`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add next/src/components/site-config-dialog/campground-editor.tsx next/src/components/site-config-dialog/serialize.ts next/src/components/site-config-dialog/serialize.test.ts
git commit -m "feat(config): per-campground adjacent-site alert control"
```

---

## Task 8: Card pill

**Files:**
- Create: `next/src/components/campground/adjacent-badge.tsx`
- Create: `next/src/components/campground/adjacent-badge.test.tsx`
- Modify: `next/src/components/campground.tsx`

**Interfaces:**
- Consumes: `AdjacentGroup` from `@/types/campground`.
- Produces: `function AdjacentBadge({ groups }: { groups?: AdjacentGroup[] }): JSX.Element | null`.

- [ ] **Step 1: Write the failing test**

Create `next/src/components/campground/adjacent-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdjacentBadge } from "./adjacent-badge";

const group = (siteIds: string[]) => ({
    campgroundId: "cg1", siteIds, siteNames: siteIds,
    from: "2026-06-19", to: "2026-06-21", nights: 2, anchorTier: "none" as const,
});

describe("AdjacentBadge", () => {
    it("renders nothing when there are no groups", () => {
        const { container } = render(<AdjacentBadge groups={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it("shows the size of the largest group", () => {
        render(<AdjacentBadge groups={[group(["012", "013"]), group(["020", "021", "022"])]} />);
        expect(screen.getByText(/3 adjacent/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/components/campground/adjacent-badge.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the badge**

Create `next/src/components/campground/adjacent-badge.tsx`:

```tsx
import type { JSX } from "react";
import type { AdjacentGroup } from "@/types/campground";

export function AdjacentBadge({ groups }: { groups?: AdjacentGroup[] }): JSX.Element | null {
    if (!groups || groups.length === 0) return null;
    const largest = Math.max(...groups.map((g) => g.siteIds.length));
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
            title="Adjacent sites open for the same dates"
        >
            <span aria-hidden>⛓</span>
            {largest} adjacent
        </span>
    );
}
```

Match the exact className idiom used by `open-count-badge.tsx` (read it and mirror its Tailwind/dark-mode classes so the two pills look consistent).

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/components/campground/adjacent-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it in the card**

In `next/src/components/campground.tsx`, import `AdjacentBadge` and render it next to where the open-count is shown, passing `campground.adjacentGroups`:

```tsx
import { AdjacentBadge } from "./campground/adjacent-badge";
// ...beside the open-count display:
<AdjacentBadge groups={campground.adjacentGroups} />
```

- [ ] **Step 6: Typecheck + commit**

Run: `cd next && npx tsc --noEmit`

```bash
git add next/src/components/campground/adjacent-badge.tsx next/src/components/campground/adjacent-badge.test.tsx next/src/components/campground.tsx
git commit -m "feat(card): adjacent-sites pill"
```

---

## Task 9: Map-modal cluster highlight

**Files:**
- Modify: `next/src/components/dashboard/map-modal/campground-map-modal.tsx`
- Modify: `next/src/components/dashboard/map-modal/site-list.tsx`
- Modify: `next/src/components/dashboard/map-modal/site-map.tsx`
- Test: `next/src/components/dashboard/map-modal/site-list.test.tsx`

**Interfaces:**
- Consumes: `campground.adjacentGroups` (already on `ProcessedCampground`); existing `MapSite[]`.
- Produces: site-list shows a labeled "Adjacent group" header for grouped open sites; map applies a highlight class/style to grouped site ids.

- [ ] **Step 1: Write the failing test (site-list label)**

In `next/src/components/dashboard/map-modal/site-list.test.tsx`, add a test that when `adjacentGroups` includes a group of sites `012`,`013`, the list renders an "Adjacent group" label containing those site names and the window dates. Follow the file's existing render harness:

```tsx
it("labels an adjacent group with its sites and dates", () => {
    // render SiteList with sites incl. 012/013 open and a matching adjacentGroups prop
    expect(screen.getByText(/Adjacent group/i)).toBeInTheDocument();
    expect(screen.getByText(/012/)).toBeInTheDocument();
    expect(screen.getByText(/Jun 1\d/)).toBeInTheDocument(); // window date
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd next && npx vitest run src/components/dashboard/map-modal/site-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Thread `adjacentGroups` to the list and map**

In `campground-map-modal.tsx`, pass `campground.adjacentGroups ?? []` as a new `adjacentGroups` prop to both `SiteList` and `SiteMap`. Compute a `Set<string>` of grouped site ids once and pass it where convenient.

In `site-list.tsx`, accept `adjacentGroups?: AdjacentGroup[]`. Render, above the normal site rows, one labeled block per group:

```tsx
{(adjacentGroups ?? []).map((g) => (
    <div key={g.siteIds.join(",")} className="mb-2 rounded-md border border-emerald-300 p-2">
        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            ⛓ Adjacent group · sites {g.siteNames.join(", ")} · open {formatWindow(g.from, g.to)}
        </div>
    </div>
))}
```

Use the existing date-formatting helper used elsewhere in the modal for `formatWindow` (find how `site-info.tsx`/`site-list.tsx` format match dates and reuse it; do not introduce a new formatter).

In `site-map.tsx`, accept the grouped-id set and, when adding a marker whose id is in the set, add a highlight (e.g. a distinct marker class or a circle). Minimal version: give grouped markers a CSS class `adjacent-highlight` and add the rule to the modal's styles. Keep it additive — do not change non-grouped markers.

- [ ] **Step 4: Run to verify it passes**

Run: `cd next && npx vitest run src/components/dashboard/map-modal/site-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `cd next && npx tsc --noEmit`

```bash
git add next/src/components/dashboard/map-modal/campground-map-modal.tsx next/src/components/dashboard/map-modal/site-list.tsx next/src/components/dashboard/map-modal/site-map.tsx next/src/components/dashboard/map-modal/site-list.test.tsx
git commit -m "feat(map-modal): highlight adjacent open clusters"
```

---

## Task 10: Notifier — detect, dedup, and email adjacent groups

**Files:**
- Modify: `notifier/check.ts`
- Modify: `notifier/lib/email.ts`
- Test: `notifier/lib/email.test.ts`
- Test: `notifier/cooldown-dedup.test.ts` (or a new `notifier/adjacent-groups-notify.test.ts`)

**Interfaces:**
- Consumes: `findAdjacentGroups`, `AdjacentGroup`, `AdjacencySite` from `../next/src/lib/adjacent-groups`; `getSiteDetailsCached` from `../next/src/lib/site-details-cache`; the notifier's `RestKvAdapter` (now a `KvLike`); `formatEmail`.
- Produces:
  - `NotifierState.groups?: Record<string, Array<{ from: string; to: string; seen: string }>>` (key = `campgroundId:sortedSiteIds`).
  - `function diffGroupsWithCooldown(currentGroups, priorState, nowMs, cooldownMs?): { newGroups: AdjacentGroup[]; nextGroupState }`.
  - `formatEmail` renders an "Adjacent openings" section and leads the subject with groups when present.

- [ ] **Step 1: Write the failing dedup test**

Create `notifier/adjacent-groups-notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffGroupsWithCooldown } from "./check";
import type { AdjacentGroup } from "../next/src/lib/adjacent-groups";

const g = (ids: string[], from: string, to: string): AdjacentGroup => ({
    campgroundId: "cg1", siteIds: ids, siteNames: ids, from, to, nights: 2, anchorTier: "none",
});
const now = new Date("2026-06-18T12:00:00Z").getTime();

describe("diffGroupsWithCooldown", () => {
    it("reports a brand-new group", () => {
        const { newGroups } = diffGroupsWithCooldown([g(["012", "013"], "2026-06-19", "2026-06-21")], null, now);
        expect(newGroups).toHaveLength(1);
    });

    it("suppresses a group already alerted within the cooldown", () => {
        const prior = { groups: { "cg1:012,013": [{ from: "2026-06-19", to: "2026-06-21", seen: new Date(now).toISOString() }] } };
        const { newGroups } = diffGroupsWithCooldown([g(["012", "013"], "2026-06-19", "2026-06-21")], prior, now);
        expect(newGroups).toHaveLength(0);
    });

    it("re-alerts after the cooldown elapses", () => {
        const stale = new Date(now - 25 * 60 * 60 * 1000).toISOString();
        const prior = { groups: { "cg1:012,013": [{ from: "2026-06-19", to: "2026-06-21", seen: stale }] } };
        const { newGroups } = diffGroupsWithCooldown([g(["012", "013"], "2026-06-19", "2026-06-21")], prior, now);
        expect(newGroups).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd notifier && npx vitest run adjacent-groups-notify.test.ts`
Expected: FAIL (`diffGroupsWithCooldown` not exported).

- [ ] **Step 3: Implement `diffGroupsWithCooldown`**

In `notifier/check.ts`, add the `groups` field to the `NotifierState` interface:

```ts
    /** group key ("campgroundId:sortedSiteIds") -> alerted windows with last-seen ISO. */
    groups?: Record<string, Array<{ from: string; to: string; seen: string }>>;
```

Add the function (mirrors `diffMatchesWithCooldown`'s window-overlap-within-cooldown logic, keyed by group):

```ts
const groupKey = (g: AdjacentGroup): string => `${g.campgroundId}:${[...g.siteIds].sort().join(",")}`;

export function diffGroupsWithCooldown(
    currentGroups: AdjacentGroup[],
    priorState: { groups?: NotifierState["groups"] } | null,
    nowMs: number,
    cooldownMs: number = COOLDOWN_MS,
): { newGroups: AdjacentGroup[]; nextGroupState: NonNullable<NotifierState["groups"]> } {
    const cutoff = nowMs - cooldownMs;
    const prior = priorState?.groups ?? {};
    const seenIso = new Date(nowMs).toISOString();

    // Prior alerted windows per key still within cooldown.
    const priorByKey = new Map<string, Array<{ from: string; to: string }>>();
    for (const [key, ranges] of Object.entries(prior)) {
        const fresh = ranges.filter((r) => new Date(r.seen).getTime() >= cutoff);
        if (fresh.length) priorByKey.set(key, fresh.map((r) => ({ from: r.from, to: r.to })));
    }

    const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) =>
        a.from < b.to && b.from < a.to;

    const newGroups: AdjacentGroup[] = [];
    const next: NonNullable<NotifierState["groups"]> = {};
    for (const g of currentGroups) {
        const key = groupKey(g);
        const priorRanges = priorByKey.get(key) ?? [];
        const isNew = !priorRanges.some((r) => overlaps(r, g));
        if (isNew) newGroups.push(g);
        (next[key] ??= []).push({ from: g.from, to: g.to, seen: seenIso });
    }
    // Retain prior fresh windows not re-seen this cycle.
    for (const [key, ranges] of priorByKey.entries()) {
        const merged = next[key] ?? (next[key] = []);
        for (const r of ranges) {
            if (!merged.some((m) => m.from === r.from && m.to === r.to)) {
                merged.push({ ...r, seen: seenIso });
            }
        }
    }
    return { newGroups, nextGroupState: next };
}
```

Ensure `AdjacentGroup` is imported in `check.ts`:

```ts
import { findAdjacentGroups, type AdjacentGroup, type AdjacencySite } from "../next/src/lib/adjacent-groups";
import { getSiteDetailsCached } from "../next/src/lib/site-details-cache";
```

- [ ] **Step 4: Run to verify dedup passes**

Run: `cd notifier && npx vitest run adjacent-groups-notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing email test**

In `notifier/lib/email.test.ts`, add:

```ts
it("renders an Adjacent openings section and leads the subject", () => {
    const groups = [{ campgroundId: "cg1", siteIds: ["012", "013"], siteNames: ["012", "013"], from: "2026-06-19", to: "2026-06-21", nights: 2, anchorTier: "none" as const }];
    const { subject, html } = formatEmail([], { adjacentGroups: groups, campgroundNamesById: { cg1: "Glacier View" } });
    expect(subject).toMatch(/adjacent/i);
    expect(html).toMatch(/Adjacent openings/i);
    expect(html).toMatch(/012/);
});
```

Adjust the option names to match what you implement in Step 6.

- [ ] **Step 6: Implement the email section + subject**

In `notifier/lib/email.ts`, extend `FormatEmailOptions` with:

```ts
    adjacentGroups?: import("../../next/src/lib/adjacent-groups").AdjacentGroup[];
    campgroundNamesById?: Record<string, string>;
```

In `formatEmail`: when `options.adjacentGroups?.length`, prepend an "Adjacent openings" HTML block (mirror the existing per-match block markup/styles in the file) listing per group: campground name (from `campgroundNamesById`), `siteNames.join(", ")`, the window dates (reuse the email's existing date formatter), and the rec.gov booking link pattern already used for single sites. Set the subject so groups lead, e.g.:

```ts
    if (options.adjacentGroups && options.adjacentGroups.length > 0) {
        const g = options.adjacentGroups[0];
        const name = options.campgroundNamesById?.[g.campgroundId] ?? "a campground";
        subject = `${g.siteIds.length} adjacent sites open at ${name}` +
            (options.adjacentGroups.length > 1 ? ` (+${options.adjacentGroups.length - 1} more)` : "");
    } else {
        // existing per-match subject logic unchanged
    }
```

Keep the existing per-site sections rendering unchanged below the new block. Update `email-preview.html` / `render-preview.ts` if they hardcode sample data, so the preview shows the new section.

- [ ] **Step 7: Run the email test**

Run: `cd notifier && npx vitest run lib/email.test.ts`
Expected: PASS.

- [ ] **Step 8: Wire group detection into the run loop**

In `notifier/check.ts`, in the per-campground processing where availability is computed for the run, for each campground with `adjacencyAnchor` set: load `getSiteDetailsCached(cg.id, kvAdapter)` (the module-level `kvAdapter` is a `RestKvAdapter`, now a `KvLike`; if it is `null`, skip geo — pass `[]` so number fallback still works from availability site names by synthesizing coordless `AdjacencySite`s from the availability map). Build `AdjacencySite[]` and `availableNightsByName` (keyed by `siteName`) exactly as in Task 6, call `findAdjacentGroups`, and collect groups across campgrounds for the user.

Then, per user: run `diffGroupsWithCooldown(userGroups, priorState, now.getTime())`, apply the **same lead-time gate** used for per-site matches (curators immediate; others only groups whose earliest constituent first-seen is ≥ `LEAD_TIME_MS` old — reuse the existing first-seen map keyed by the per-site signatures of the group's sites, taking the max first-seen across the group's sites), pass `newGroups` into `sendEmailToUser` → `formatEmail` via the new options, and merge `nextGroupState` into the persisted `NotifierState` alongside the existing `sites` bucket (do not overwrite `sites`).

Because the lead-time wiring touches the existing run loop, add an integration assertion in `notifier/worker.test.ts` (or `check.test.ts`) following its existing harness: a campground with `adjacencyAnchor: "all"` and two adjacent open sites produces an email whose HTML contains "Adjacent openings", and a second run within cooldown does not re-send it.

- [ ] **Step 9: Run the full notifier suite + typecheck (REQUIRED — not in `next/` CI)**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add notifier/check.ts notifier/lib/email.ts notifier/lib/email.test.ts notifier/adjacent-groups-notify.test.ts notifier/worker.test.ts notifier/email-preview.html notifier/render-preview.ts
git commit -m "feat(notifier): adjacent-group detection, dedup, and email section"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the website suite + typecheck**

Run: `cd next && npx tsc --noEmit && npx vitest run`
Expected: all PASS.

- [ ] **Step 2: Run the notifier suite + typecheck**

Run: `cd notifier && npx tsc --noEmit && npx vitest run`
Expected: all PASS.

- [ ] **Step 3: Lint**

Run: `cd next && npx eslint .`
Expected: clean (fix any new warnings introduced).

- [ ] **Step 4: Manual smoke (optional, no deploy)**

Render the email preview locally (`cd notifier && npx tsx render-preview.ts` or the project's documented preview command) and confirm the "Adjacent openings" section appears. Do not deploy / push unless explicitly asked.

---

## Self-Review Notes

- **Spec coverage:** adjacency hybrid (Task 2), shared window + anchor + blackout + start-day (Task 3), coord cache incl. lazy notifier fetch (Tasks 4, 6, 10), config field (Tasks 5, 7), server-computed groups shared across surfaces (Task 6), card pill (Task 8), map highlight (Task 9), additive email + subject + dedup/cooldown/lead-time (Task 10), tests throughout, verification (Task 11). Out-of-scope items from the spec (configurable min size, per-campground geo override, group/individual de-dup) are intentionally not implemented.
- **Data flow verified:** `adjacentGroups` is set on `SnapshotCampground` server-side (Task 6) and reaches `ProcessedCampground` with no extra code — `use-campgrounds-data.ts:56` casts the snapshot through, `overlayConfigRatings` spreads `...cg`, and `formatGroupsByFavorites` deep-clones. The config field round-trips automatically (`EditableCampground extends Campground`; `toEditableCampground` spreads `...cg`); only `sanitizeCampground` needs an explicit write-out line (Task 7).
- **Type consistency:** `AdjacentGroup` is defined once in `adjacent-groups.ts` and imported everywhere (types, availability route, components, notifier, email). `findAdjacentGroups` / `buildAdjacencyEdges` / `getSiteDetailsCached` / `diffGroupsWithCooldown` signatures are fixed in their defining tasks and consumed unchanged.
- **Read-the-neighbor steps:** Tasks 6, 9, and 10 ask the implementer to match an existing test harness / date formatter / email-block markup in the target file rather than reproducing it blind. These are deliberate "mirror the neighbor" steps, not TODOs — each names the exact file and the exact pattern to copy.
