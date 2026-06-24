import { readSession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { withErrorLogging } from "@/lib/route-helpers";
import { upsertPushSub, removePushSub, isValidSubscription } from "@/lib/push/subscription";

// Store the calling user's Web Push subscription. Body is a browser
// PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }).
async function postHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const body = (await request.json().catch(() => null)) as unknown;
    if (!isValidSubscription(body)) return withCors(jsonResponse({ error: "Invalid subscription" }, 400));

    await upsertPushSub(session.email, { ...body, createdAt: new Date().toISOString() });
    return withCors(jsonResponse({ ok: true }));
}
export const POST = withErrorLogging(postHandler, "POST /api/users/me/push");

// Remove a subscription by endpoint (this device turned push off).
async function deleteHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) return withCors(jsonResponse({ error: "Missing endpoint" }, 400));

    await removePushSub(session.email, body.endpoint);
    return withCors(jsonResponse({ ok: true }));
}
export const DELETE = withErrorLogging(deleteHandler, "DELETE /api/users/me/push");
