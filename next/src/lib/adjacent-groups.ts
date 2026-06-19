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
