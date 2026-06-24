import { getEnv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { removePushSub } from "@/lib/push/subscription";
import { withErrorLogging } from "@/lib/route-helpers";

// Called by the notifier to drop subscriptions a push service reported as gone
// (404/410). Authed with the shared admin secret, like the other /api/admin/* routes.
async function postHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const body = (await request.json().catch(() => null)) as { email?: string; endpoints?: string[] } | null;
    if (!body?.email || !Array.isArray(body.endpoints)) {
        return withCors(jsonResponse({ error: "Bad request" }, 400));
    }

    for (const endpoint of body.endpoints) {
        await removePushSub(body.email, endpoint);
    }
    return withCors(jsonResponse({ ok: true, pruned: body.endpoints.length }));
}
export const POST = withErrorLogging(postHandler, "POST /api/admin/push/prune");
