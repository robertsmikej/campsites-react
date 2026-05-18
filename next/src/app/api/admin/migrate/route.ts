// One-shot maintenance endpoint. Idempotent.
// - Adds the three Phase 0c-vintage campgrounds (Pine Flats, Deadwood Lookout,
//   Lookout Butte) to the curated default if they aren't already there.
// - Wipes orphan `email:*` KV records left over from the retired anonymous
//   subscribe flow.
//
// Gated by API_SECRET (same Bearer token the notifier uses). Safe to call
// repeatedly: it's idempotent and skips entries already present.

import { getEnv, getKv } from "@/lib/cloudflare";
import { jsonResponse, withCors } from "@/lib/responses";
import { campgroundCatalog } from "@/data/campground-catalog";
import { defaultCampgroundConfigurations } from "@/data/site-configurations";
import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";

const SEED_IDS = ["232312", "233881", "233128"] as const;

interface DefaultConfig {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

function mergeCatalogEntry(id: string): Campground | null {
    const catalogEntry = campgroundCatalog["recreation.gov"].find((c) => c.id === id);
    const configEntry = defaultCampgroundConfigurations["recreation.gov"].find((c) => c.id === id);
    if (!catalogEntry) return null;
    return {
        ...catalogEntry,
        ...(configEntry ?? {}),
        sites: configEntry?.sites ?? catalogEntry.sites ?? { favorites: [], worthwhile: [] },
    };
}

export async function POST(request: Request): Promise<Response> {
    const env = getEnv();
    if (!env.API_SECRET) {
        return withCors(jsonResponse({ error: "Server misconfigured: API_SECRET not set" }, 500));
    }
    const auth = request.headers.get("Authorization");
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401));
    }

    const kv = getKv();

    // --- 1. Seed missing campgrounds into the curated default. ---
    const current = (await kv.get("config:campgrounds", "json")) as DefaultConfig | null;
    const currentList = current?.campgrounds?.["recreation.gov"] ?? [];
    const presentIds = new Set(currentList.map((c) => c.id));

    const additions: Campground[] = [];
    for (const id of SEED_IDS) {
        if (presentIds.has(id)) continue;
        const entry = mergeCatalogEntry(id);
        if (entry) additions.push(entry);
    }

    let defaultUpdated = false;
    if (additions.length > 0) {
        const nextConfig: SiteConfig = {
            "recreation.gov": [...currentList, ...additions],
        };
        const nextRecord = {
            campgrounds: nextConfig,
            globalSettings: current?.globalSettings ?? {
                stayLengths: [2, 3, 4, 5],
                validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            },
        };
        await kv.put("config:campgrounds", JSON.stringify(nextRecord));
        defaultUpdated = true;
    }

    // --- 2. Wipe orphan email:* records. ---
    let emailsDeleted = 0;
    let cursor: string | undefined;
    do {
        const list = await kv.list({ prefix: "email:", cursor });
        for (const key of list.keys) {
            await kv.delete(key.name);
            emailsDeleted++;
        }
        cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);

    return withCors(
        jsonResponse({
            defaultUpdated,
            addedCampgrounds: additions.map((c) => ({ id: c.id, name: c.name })),
            emailsDeleted,
        }),
    );
}
