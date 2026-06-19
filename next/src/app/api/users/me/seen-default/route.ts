import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { updateUserProfile } from "@/lib/users";
import { withErrorLogging } from "@/lib/route-helpers";

/**
 * Marks the curator's default as "seen" for the current user as of now, so the
 * dashboard's "recently added" nudge stops offering the current additions. Used
 * when the user dismisses the nudge or adds the whole default from settings. The
 * timestamp is always the server clock — any request body is ignored.
 */
async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const updated = await updateUserProfile(session.email, { defaultSeenAt: new Date().toISOString() });
    if (!updated) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    return withCors(jsonResponse(updated));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/seen-default");
