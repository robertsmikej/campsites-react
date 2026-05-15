import { getKv } from "./cloudflare";
import type { UserProfile } from "@/types/user";

const PROFILE_PREFIX = "user:";
const PROFILE_SUFFIX = ":profile";
const SESSION_PREFIX = "session:";

function profileKey(email: string): string {
    return `${PROFILE_PREFIX}${email}${PROFILE_SUFFIX}`;
}

function campgroundsKey(email: string): string {
    return `${PROFILE_PREFIX}${email}:campgrounds`;
}

export async function getUserProfile(email: string): Promise<UserProfile | null> {
    const kv = getKv();
    return (await kv.get(profileKey(email), "json")) as UserProfile | null;
}

export async function createUserProfile(
    email: string,
    seed: Pick<UserProfile, "name"> & Partial<Pick<UserProfile, "picture">>,
): Promise<UserProfile> {
    const kv = getKv();
    const profile: UserProfile = {
        email,
        name: seed.name,
        picture: seed.picture,
        roles: [],
        createdAt: new Date().toISOString(),
    };
    await kv.put(profileKey(email), JSON.stringify(profile));
    return profile;
}

export async function updateUserProfile(
    email: string,
    patch: Partial<Omit<UserProfile, "email" | "createdAt">>,
): Promise<UserProfile | null> {
    const kv = getKv();
    const existing = (await kv.get(profileKey(email), "json")) as UserProfile | null;
    if (!existing) return null;
    const merged: UserProfile = { ...existing, ...patch };
    await kv.put(profileKey(email), JSON.stringify(merged));
    return merged;
}

export async function deleteUser(email: string): Promise<void> {
    const kv = getKv();
    await kv.delete(profileKey(email));
    await kv.delete(campgroundsKey(email));

    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: SESSION_PREFIX, cursor });
        for (const key of list.keys) {
            const session = (await kv.get(key.name, "json")) as { email?: string } | null;
            if (session?.email === email) {
                await kv.delete(key.name);
            }
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
}

export async function listCurators(): Promise<string[]> {
    const kv = getKv();
    const curators: string[] = [];
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: PROFILE_PREFIX, cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(PROFILE_SUFFIX)) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (profile?.roles?.includes("curator") && profile.email) {
                curators.push(profile.email);
            }
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
    return curators;
}

export async function bootstrapCuratorIfFirst(
    email: string,
    bootstrapEmail: string | undefined,
): Promise<boolean> {
    if (!bootstrapEmail) return false;
    if (email.toLowerCase() !== bootstrapEmail.toLowerCase()) return false;
    const curators = await listCurators();
    if (curators.length > 0) return false;
    const updated = await updateUserProfile(email, { roles: ["curator"] });
    return !!updated;
}
