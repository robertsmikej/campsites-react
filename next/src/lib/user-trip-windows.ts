import { getKv } from "./cloudflare";
import type { TripWindow } from "@/types/campground";

export interface TripWindowsRecord {
    tripWindows: TripWindow[];
    updatedAt: string | null;
}

function key(email: string): string {
    return `user:${email}:trip-windows`;
}

/**
 * Read trip windows from the dedicated key. On first access after deploy,
 * migrates from the legacy location (globalSettings.tripWindows inside
 * the campgrounds blob) and strips the old field.
 */
export async function getUserTripWindows(email: string): Promise<TripWindowsRecord> {
    const kv = getKv();

    // 1. Check the dedicated key first.
    const existing = (await kv.get(key(email), "json")) as TripWindowsRecord | null;
    if (existing && existing.tripWindows) return existing;

    // 2. Read-through migration: pull from the campgrounds blob.
    const campKey = `user:${email}:campgrounds`;
    const campRaw = (await kv.get(campKey, "json")) as {
        campgrounds: unknown;
        globalSettings: { tripWindows?: TripWindow[]; [k: string]: unknown };
        updatedAt: string;
    } | null;

    if (!campRaw?.globalSettings?.tripWindows?.length) return { tripWindows: [], updatedAt: null };

    const migrated: TripWindowsRecord = {
        tripWindows: campRaw.globalSettings.tripWindows,
        updatedAt: new Date().toISOString(),
    };

    // Write to the new key.
    await kv.put(key(email), JSON.stringify(migrated));

    // Strip from the old blob.
    const { tripWindows: _, ...cleanGlobalSettings } = campRaw.globalSettings;
    await kv.put(
        campKey,
        JSON.stringify({
            ...campRaw,
            globalSettings: cleanGlobalSettings,
        }),
    );

    return migrated;
}

export async function putUserTripWindows(
    email: string,
    tripWindows: TripWindow[],
): Promise<TripWindowsRecord> {
    const record: TripWindowsRecord = {
        tripWindows,
        updatedAt: new Date().toISOString(),
    };
    await getKv().put(key(email), JSON.stringify(record));
    return record;
}
