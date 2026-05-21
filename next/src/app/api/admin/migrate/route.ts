// Idempotent seed/merge endpoint.
// Ensures config:campgrounds in KV contains every campground in the in-repo
// catalog, preserving any curator-edited entries that already exist.
// Also backfills mapImage from the old `image: "*_map*.jpg"` pattern.
//
// Gated by API_SECRET (same Bearer token the notifier uses) or a signed-in
// curator session. Safe to call repeatedly.

import { getEnv, getKv } from "@/lib/cloudflare";
import { readSession } from "@/lib/sessions";
import { getUserProfile } from "@/lib/users";
import { jsonResponse, withCors } from "@/lib/responses";
import { buildDefaultFromCatalog } from "@/data/build-default";
import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";
import { withErrorLogging } from "@/lib/route-helpers";

const MAP_IMAGE_RE = /_map.*\.jpg$/i;

interface DefaultConfig {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

async function isAuthorized(request: Request): Promise<boolean> {
    const env = getEnv();
    // Accept Bearer API_SECRET (notifier-style) OR a signed-in curator session.
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

    // Build the target shape from the in-repo catalog.
    const target = buildDefaultFromCatalog();
    const current = (await kv.get("config:campgrounds", "json")) as DefaultConfig | null;
    const currentList = current?.campgrounds?.["recreation.gov"] ?? [];
    const currentIds = new Set(currentList.map((c) => c.id));

    // Add any catalog entries not already in KV; preserve existing entries verbatim.
    const additions: Campground[] = [];
    for (const c of target.campgrounds["recreation.gov"]) {
        if (!currentIds.has(c.id)) additions.push(c);
    }

    // Backfill mapImage from image pattern for any campground whose `image`
    // matches /_map*.jpg/ (one-shot cleanup for old-style records).
    const mergedList = [...currentList, ...additions].map((c) => {
        if (c.image && MAP_IMAGE_RE.test(c.image)) {
            const { image: _img, ...rest } = c;
            return { ...rest, mapImage: c.image } as Campground;
        }
        return c;
    });

    const mapImagesBackfilled = mergedList.filter((c) => !("image" in c) && "mapImage" in c && additions.every((a) => a.id !== c.id)).length;

    let didWrite = false;
    if (additions.length > 0 || mapImagesBackfilled > 0) {
        await kv.put(
            "config:campgrounds",
            JSON.stringify({
                campgrounds: { "recreation.gov": mergedList } as SiteConfig,
                globalSettings: current?.globalSettings ?? target.globalSettings,
            }),
        );
        didWrite = true;
    }

    return withCors(
        jsonResponse({
            defaultUpdated: didWrite,
            addedCampgrounds: additions.map((c) => ({ id: c.id, name: c.name })),
            mapImagesBackfilled,
        }),
    );
}
export const POST = withErrorLogging(postHandler, "POST /api/admin/migrate");
