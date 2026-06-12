import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { parseCampsite, type SiteDetail } from "@/lib/site-details";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const cacheKey = (id: string) => `site-details:${id}`;

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }

    const kv = getKv();
    const cached = (await kv.get(cacheKey(id), "json")) as SiteDetail[] | null;
    if (cached) return withCors(jsonResponse({ sites: cached }));

    const url = `https://www.recreation.gov/api/search/campsites?fq=asset_id%3A${id}&size=1000&include_non_site_specific_campsites=true`;
    let sites: SiteDetail[] = [];
    try {
        const r = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (CampWatch)" },
        });
        if (r.ok) {
            const data = (await r.json()) as { campsites?: unknown[] };
            sites = (data.campsites ?? []).map(parseCampsite).filter((s): s is SiteDetail => s !== null);
        }
    } catch {
        // Network/parse failure → empty; the modal degrades to "site data unavailable".
    }

    if (sites.length > 0) {
        await kv.put(cacheKey(id), JSON.stringify(sites), { expirationTtl: CACHE_TTL_SECONDS });
    }
    return withCors(jsonResponse({ sites }));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/site-details");
