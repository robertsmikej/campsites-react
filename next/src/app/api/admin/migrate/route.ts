// One-time reconcile: collapse the legacy `config:campgrounds` default into the
// primary curator's watchlist record, then delete the legacy key. Union by id,
// curator entries win on conflict. Idempotent — once the key is gone it's a no-op.
//
// Gated by API_SECRET (Bearer) or a signed-in curator session. Safe to re-run.

import { getEnv, getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { getUserCampgrounds, putUserCampgrounds } from "@/lib/user-campgrounds";
import { resolveDefaultOwnerEmail } from "@/lib/default-config";
import { jsonResponse, withCors } from "@/lib/responses";
import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";
import { withErrorLogging } from "@/lib/route-helpers";
import { WorkerKvAdapter } from "@/lib/recgov/worker-kv";

interface LegacyConfig {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

async function isAuthorized(request: Request): Promise<boolean> {
    const env = getEnv();
    const auth = request.headers.get("Authorization");
    if (env.API_SECRET && auth === `Bearer ${env.API_SECRET}`) return true;

    const session = await readSession(request);
    if (!session) return false;
    const profile = await getUserProfile(session.email);
    return !!profile?.roles?.includes("curator");
}

async function postHandler(request: Request): Promise<Response> {
    if (!(await isAuthorized(request))) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();
    const legacy = (await kv.get("config:campgrounds", "json")) as LegacyConfig | null;

    // No legacy key -> nothing to reconcile.
    if (!legacy) {
        return withCors(
            jsonResponse({ reconciled: false, owner: null, merged: 0, addedFromConfig: [], configKeyDeleted: false }),
        );
    }

    const owner = await resolveDefaultOwnerEmail();
    if (!owner) {
        return withCors(
            jsonResponse(
                { error: "No curator to reconcile into; assign a curator first." },
                409,
            ),
        );
    }

    const ownerRecord = await getUserCampgrounds(owner);
    const ownerList: Campground[] = ownerRecord?.campgrounds?.["recreation.gov"] ?? [];
    const legacyList: Campground[] = legacy.campgrounds?.["recreation.gov"] ?? [];

    const ownerIds = new Set(ownerList.map((c) => c.id));
    const addedFromConfig = legacyList.filter((c) => !ownerIds.has(c.id));
    const mergedList: Campground[] = [...ownerList, ...addedFromConfig];

    const globalSettings: GlobalSettings =
        ownerRecord?.globalSettings ??
        legacy.globalSettings ?? { stayLengths: [2, 3, 4, 5], validStartDays: [] };

    await putUserCampgrounds(owner, {
        campgrounds: { "recreation.gov": mergedList } as SiteConfig,
        globalSettings,
    });
    await kv.delete("config:campgrounds");

    // The owner's cached availability snapshot is now stale; clear it so the
    // dashboard rebuilds from the merged list on next load.
    await new WorkerKvAdapter(kv).deleteSnapshot(owner);

    return withCors(
        jsonResponse({
            reconciled: true,
            owner,
            merged: mergedList.length,
            addedFromConfig: addedFromConfig.map((c) => ({ id: c.id, name: c.name })),
            configKeyDeleted: true,
        }),
    );
}
export const POST = withErrorLogging(postHandler, "POST /api/admin/migrate");
