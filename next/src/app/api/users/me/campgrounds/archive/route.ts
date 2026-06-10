import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { getCampgroundArchive } from "@/lib/campground-archive";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const archive = await getCampgroundArchive(session.email);
    return withCors(jsonResponse(archive));
}
export const GET = withErrorLogging(getHandler, "GET /api/users/me/campgrounds/archive");
