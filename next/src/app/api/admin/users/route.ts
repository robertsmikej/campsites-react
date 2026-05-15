import { readSession } from "@/lib/sessions";
import { getKv } from "@/lib/cloudflare";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
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

export async function GET(request: Request): Promise<Response> {
    const session = await readSession(request);
    if (!session) return withCors(jsonResponse({ error: "Unauthorized" }, 401));

    const me = await getUserProfile(session.email);
    if (!me?.roles?.includes("curator")) {
        return withCors(jsonResponse({ error: "Forbidden" }, 403));
    }

    const users = await listAllUsers();
    return withCors(jsonResponse({ users }));
}
