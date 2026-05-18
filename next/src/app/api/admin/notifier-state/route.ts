import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { updateUserProfile } from "@/lib/users";

interface UpdateEntry {
    email: string;
    state: unknown;
    lastNotifiedAt?: string;
}

function isValidBody(body: unknown): body is { updates: UpdateEntry[] } {
    if (!body || typeof body !== "object") return false;
    const updates = (body as { updates?: unknown }).updates;
    if (!Array.isArray(updates)) return false;
    return updates.every((u) => {
        if (!u || typeof u !== "object") return false;
        if (typeof (u as { email?: unknown }).email !== "string") return false;
        // `state` can be anything (including null or undefined); we just persist it.
        return true;
    });
}

export async function PUT(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return withCors(jsonResponse({ error: "Invalid JSON" }, 400));
    }
    if (!isValidBody(body)) {
        return withCors(jsonResponse({ error: "Body must include updates: UpdateEntry[]" }, 400));
    }

    const kv = getKv();
    let updated = 0;
    for (const entry of body.updates) {
        await kv.put(`user:${entry.email}:notifier-state`, JSON.stringify(entry.state));
        if (entry.lastNotifiedAt) {
            await updateUserProfile(entry.email, { lastNotifiedAt: entry.lastNotifiedAt });
        }
        updated++;
    }

    return withCors(jsonResponse({ updated }));
}
