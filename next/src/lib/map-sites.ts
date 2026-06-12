import type { SiteDetail } from "./site-details";

export interface MapSite extends SiteDetail {
    open: boolean;
    openCount: number;
    tier: "fav" | "worth" | "other";
}

interface AvailabilityLike {
    siteName?: string;
    matches?: unknown[];
}

const norm = (s: string) => s.trim();

/** Join site details + availability (by siteName) + favorites/worthwhile (names) into MapSite[]. */
export function mergeMapSites(
    details: SiteDetail[],
    availabilityById: Record<string, AvailabilityLike>,
    tiers: { favorites: string[]; worthwhile: string[] },
): MapSite[] {
    const openByName = new Map<string, number>();
    for (const a of Object.values(availabilityById ?? {})) {
        if (!a?.siteName) continue;
        openByName.set(norm(a.siteName), Array.isArray(a.matches) ? a.matches.length : 0);
    }
    const fav = new Set((tiers.favorites ?? []).map(norm));
    const worth = new Set((tiers.worthwhile ?? []).map(norm));

    return details.map((d) => {
        const key = norm(d.id);
        const openCount = openByName.get(key) ?? 0;
        const tier: MapSite["tier"] = fav.has(key) ? "fav" : worth.has(key) ? "worth" : "other";
        return { ...d, open: openCount > 0, openCount, tier };
    });
}
