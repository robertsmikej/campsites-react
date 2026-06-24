import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { REC_GOV_USER_AGENT } from "@/lib/recgov/types";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days; rosters rarely change
const cacheKey = (id: string) => `sites:${id}`;

interface RecCampsite {
    name?: string;
}

async function getHandler(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const { id } = await context.params;
    if (!/^\d+$/.test(id)) {
        return withCors(jsonResponse({ error: "Invalid campground id" }, 400));
    }

    const kv = getKv();
    const cached = (await kv.get(cacheKey(id), "json")) as string[] | null;
    if (cached) return withCors(jsonResponse({ sites: cached }));

    const url = `https://www.recreation.gov/api/search/campsites?fq=asset_id%3A${id}&size=1000&include_non_site_specific_campsites=true`;
    let labels: string[] = [];
    try {
        const r = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": REC_GOV_USER_AGENT },
        });
        if (r.ok) {
            const data = (await r.json()) as { campsites?: RecCampsite[] };
            labels = [
                ...new Set((data.campsites ?? []).map((c) => (c.name ?? "").trim()).filter(Boolean)),
            ].sort();
        }
    } catch {
        // Network/parse failure → return empty; the client falls back to the textbox.
    }

    if (labels.length > 0) {
        await kv.put(cacheKey(id), JSON.stringify(labels), { expirationTtl: CACHE_TTL_SECONDS });
    }
    return withCors(jsonResponse({ sites: labels }));
}
export const GET = withErrorLogging(getHandler, "GET /api/campgrounds/[id]/sites");
