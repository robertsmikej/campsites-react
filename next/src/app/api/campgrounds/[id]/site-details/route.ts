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
