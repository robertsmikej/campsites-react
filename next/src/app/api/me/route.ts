import { readSession, destroySession } from "@/lib/sessions";
import { jsonResponse, withCors } from "@/lib/responses";
import { deleteUser, getUserProfile, updateUserProfile } from "@/lib/users";
import type { UserProfile } from "@/types/user";
import { withErrorLogging } from "@/lib/route-helpers";

async function getHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ user: null }));
    const profile = await getUserProfile(session.email);
    if (!profile) return withCors(jsonResponse({ user: null }));
    return withCors(jsonResponse({ user: profile }));
}
export const GET = withErrorLogging(getHandler, "GET /api/me");

interface PatchBody {
    name?: string;
    notifications?: { enabled: boolean; frequencyMinutes: 1 | 5 | 15 | 60 | 240 };
    defaultNotifyScope?: "favorites" | "worthwhile" | "all";
}

const ALLOWED_PATCH_KEYS = new Set(["name", "notifications", "defaultNotifyScope"]);

function isValidPatch(body: unknown): body is PatchBody {
    if (!body || typeof body !== "object") return false;
    const obj = body as Record<string, unknown>;
    if (Object.keys(obj).some((k) => !ALLOWED_PATCH_KEYS.has(k))) return false;
    if (obj.name !== undefined && typeof obj.name !== "string") return false;
    if (obj.notifications !== undefined) {
        const n = obj.notifications as Record<string, unknown>;
        if (typeof n !== "object" || n === null) return false;
        if (typeof n.enabled !== "boolean") return false;
        if (
            n.frequencyMinutes !== 1 &&
            n.frequencyMinutes !== 5 &&
            n.frequencyMinutes !== 15 &&
            n.frequencyMinutes !== 60 &&
            n.frequencyMinutes !== 240
        )
            return false;
    }
    if (
        obj.defaultNotifyScope !== undefined &&
        obj.defaultNotifyScope !== "favorites" &&
        obj.defaultNotifyScope !== "worthwhile" &&
        obj.defaultNotifyScope !== "all"
    ) {
        return false;
    }
    return true;
}

async function patchHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidPatch(body)) {
        return withCors(jsonResponse({ error: "Invalid patch body" }, 400));
    }

    const patch: Partial<UserProfile> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.notifications !== undefined) patch.notifications = body.notifications;
    if (body.defaultNotifyScope !== undefined) patch.defaultNotifyScope = body.defaultNotifyScope;

    const updated = await updateUserProfile(session.email, patch);
    if (!updated) return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    return withCors(jsonResponse(updated));
}
export const PATCH = withErrorLogging(patchHandler, "PATCH /api/me");

async function deleteHandler(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    await deleteUser(session.email);
    const { cookie } = await destroySession(request);
    const response = new Response(null, { status: 204 });
    response.headers.append("Set-Cookie", cookie);
    return withCors(response);
}
export const DELETE = withErrorLogging(deleteHandler, "DELETE /api/me");
