import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { createUserProfile, getUserProfile } from "@/lib/users";
import { putUserCampgrounds } from "@/lib/user-campgrounds";
import { jsonResponse, withCors } from "@/lib/responses";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { withErrorLogging } from "@/lib/route-helpers";
import { getDefaultConfig } from "@/lib/default-config";
import type { UserProfile } from "@/types/user";

async function listAllUsers(): Promise<UserProfile[]> {
    const kv = getKv();
    const profiles: UserProfile[] = [];
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: "user:", cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(":profile")) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (profile?.email) profiles.push(profile);
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    profiles.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    return profiles;
}

async function assertCurator(request: Request): Promise<Response | null> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    const me = await getUserProfile(session.email);
    if (!me?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }
    return null;
}

async function getHandler(request: Request): Promise<Response> {
    const denied = await assertCurator(request);
    if (denied) return denied;

    const users = await listAllUsers();
    return withCors(jsonResponse({ users }));
}
export const GET = withErrorLogging(getHandler, "GET /api/admin/users");

interface PostBody {
    email: string;
    name?: string;
}

function isValidBody(body: unknown): body is PostBody {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    if (typeof b.email !== "string") return false;
    if (b.name !== undefined && typeof b.name !== "string") return false;
    return true;
}

async function postHandler(request: Request): Promise<Response> {
    const denied = await assertCurator(request);
    if (denied) return denied;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include email (and optional name)" }, 400));
    }

    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return withCors(jsonResponse({ error: "Invalid email" }, 400));
    }

    const existing = await getUserProfile(email);
    if (existing) {
        return withCors(jsonResponse({ error: "User already exists", profile: existing }, 409));
    }

    const profile = await createUserProfile(email, { name: body.name?.trim() || email });

    // Clone the curator's default watchlist so the new user gets alerts right away.
    const defaultConfig = await getDefaultConfig();
    await putUserCampgrounds(email, {
        campgrounds: defaultConfig.campgrounds,
        globalSettings: defaultConfig.globalSettings,
    });

    return withCors(jsonResponse(profile, 201));
}
export const POST = withErrorLogging(postHandler, "POST /api/admin/users");
