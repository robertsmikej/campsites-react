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
