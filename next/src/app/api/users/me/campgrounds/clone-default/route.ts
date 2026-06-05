import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { putUserCampgrounds } from "@/lib/user-campgrounds";
import { getDefaultConfig } from "@/lib/default-config";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";
import { withErrorLogging } from "@/lib/route-helpers";

async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const { campgrounds, globalSettings } = await getDefaultConfig();
    const stored = await putUserCampgrounds(session.email, { campgrounds, globalSettings });

    const adapter = new WorkerKvAdapter(getKv());
    await adapter.deleteSnapshot(session.email);

    return withCors(jsonResponse(stored));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/campgrounds/clone-default");
