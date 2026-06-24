import { parseCampsite, type SiteDetail } from "./site-details";
import { REC_GOV_USER_AGENT } from "./recgov/types";

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
            headers: { Accept: "application/json", "User-Agent": REC_GOV_USER_AGENT },
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
