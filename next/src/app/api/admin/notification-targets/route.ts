import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import type { UserProfile, UserRole } from "@/types/user";
import type { GlobalSettings, NotifyScope, SiteConfig } from "@/types/campground";
import { withErrorLogging } from "@/lib/route-helpers";

interface NotificationTarget {
    email: string;
    name: string;
    roles: UserRole[];
    notifications: { enabled: boolean; frequencyMinutes: 1 | 5 | 15 | 60 | 240 };
    defaultNotifyScope?: NotifyScope;
    lastNotifiedAt?: string;
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    notifierState: unknown | null;
}

const PROFILE_PREFIX = "user:";
const PROFILE_SUFFIX = ":profile";

async function getHandler(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();
    const targets: NotificationTarget[] = [];
    let cursor: string | undefined;

    do {
        const list = await kv.list({ prefix: PROFILE_PREFIX, cursor });
        for (const key of list.keys) {
            if (!key.name.endsWith(PROFILE_SUFFIX)) continue;
            const profile = (await kv.get(key.name, "json")) as UserProfile | null;
            if (!profile?.email) continue;

            const userList = await getUserCampgrounds(profile.email);
            const entries = userList?.campgrounds?.["recreation.gov"] ?? [];
            if (entries.length === 0) continue;

            const notifierState = await kv.get(`user:${profile.email}:notifier-state`, "json");

            const target: NotificationTarget = {
                email: profile.email,
                name: profile.name ?? profile.email,
                roles: profile.roles ?? [],
                notifications: profile.notifications ?? { enabled: true, frequencyMinutes: 15 },
                campgrounds: userList!.campgrounds,
                globalSettings: userList!.globalSettings,
                notifierState: notifierState ?? null,
            };
            if (profile.defaultNotifyScope) target.defaultNotifyScope = profile.defaultNotifyScope;
            if (profile.lastNotifiedAt) target.lastNotifiedAt = profile.lastNotifiedAt;
            targets.push(target);
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    targets.sort((a, b) => a.email.localeCompare(b.email));
    return withCors(jsonResponse({ targets }));
}
export const GET = withErrorLogging(getHandler, "GET /api/admin/notification-targets");
