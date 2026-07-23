import { getEnv } from "@/lib/cloudflare";
import { getUserProfile, listCurators } from "@/lib/users";
import { getUserCampgrounds } from "@/lib/user-campgrounds";
import { buildDefaultFromCatalog } from "@/data/build-default";
import type { GlobalSettings, SiteConfig } from "@/types/campground";

export interface DefaultConfig {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
}

/**
 * Email of the curator whose watchlist IS the public default.
 * Fast path: BOOTSTRAP_ADMIN_EMAIL when that user holds the curator role
 * (one KV get). Cold path: first curator from listCurators() (KV scan).
 * Null when no curator exists yet.
 */
export async function resolveDefaultOwnerEmail(): Promise<string | null> {
    const bootstrap = getEnv().BOOTSTRAP_ADMIN_EMAIL;
    if (bootstrap) {
        const profile = await getUserProfile(bootstrap);
        if (profile?.roles?.includes("curator") && profile.email) {
            return profile.email;
        }
    }
    const curators = await listCurators();
    return curators[0] ?? null;
}

/**
 * The single source of truth for "the default list". Resolves the primary
 * curator's watchlist record live; falls back to the in-repo catalog when no
 * curator or record exists yet. Shape matches the historical GET /api/default
 * body so existing consumers are unaffected.
 */
export async function getDefaultConfig(): Promise<DefaultConfig> {
    const owner = await resolveDefaultOwnerEmail();
    if (owner) {
        const record = await getUserCampgrounds(owner);
        if (record) {
            // The curator's tripWindows are personal travel dates, not part of the
            // shared watchlist. Never leak them through the public default or clone.
            const { tripWindows: _tripWindows, ...sharedGlobalSettings } = record.globalSettings;
            return { campgrounds: record.campgrounds, globalSettings: sharedGlobalSettings };
        }
    }
    return buildDefaultFromCatalog();
}
