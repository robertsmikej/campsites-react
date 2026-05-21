import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { fetchFacilitySummary, parseFacilityId, type FacilitySummary } from "@/lib/recgov-facility";

const CACHE_PREFIX = "recgov:facility:";
const CACHE_TTL_SECONDS = 60 * 60 * 24;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const { id: rawId } = await context.params;
    const parsed = parseFacilityId(decodeURIComponent(rawId));
    if (!parsed) {
        return withCors(jsonResponse({ error: "Invalid facility ID" }, 400));
    }

    const kv = getKv();
    const cacheKey = `${CACHE_PREFIX}${parsed}`;
    const cached = (await kv.get(cacheKey, "json")) as FacilitySummary | null;
    if (cached) {
        return withCors(jsonResponse({ summary: cached, cached: true }));
    }

    let summary: FacilitySummary | null;
    try {
        summary = await fetchFacilitySummary(parsed);
    } catch (e) {
        console.error("[recgov] fetch error:", e);
        return withCors(jsonResponse({ error: "Facility lookup failed" }, 502));
    }
    if (!summary) {
        return withCors(jsonResponse({ error: "Facility not found" }, 404));
    }

    await kv.put(cacheKey, JSON.stringify(summary), { expirationTtl: CACHE_TTL_SECONDS });
    return withCors(jsonResponse({ summary, cached: false }));
}
