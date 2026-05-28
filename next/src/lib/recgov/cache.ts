import type { RawMonthResult, SiteAvailabilityMap } from "./types";

export const RAW_CACHE_TTL_SECONDS = 5 * 60;
export const SNAPSHOT_CACHE_TTL_SECONDS = 10 * 60;

export const rawCacheKey = (facilityId: string, month: string): string =>
    `recgov:${facilityId}:${month}`;

export const snapshotCacheKey = (email: string): string => `snapshot:${email}`;

// Snapshot value shape — the data the dashboard ultimately consumes.
// One entry per campground the user watches; site availability already filtered.
export interface SnapshotCampground {
    campgroundId: string;
    campgroundName: string;
    campgroundArea: string;
    campgroundDescription: string;
    sites: SiteAvailabilityMap;
    totalSitesCount: number;
}

export interface AvailabilitySnapshot {
    updatedAt: string;
    campgrounds: SnapshotCampground[];
}

// Common interface used by both the Next.js worker and the notifier.
// Worker: backed by native CF KV binding. Notifier: backed by CF KV REST API.
export interface KvAdapter {
    getRaw(facilityId: string, month: string): Promise<RawMonthResult | null>;
    putRaw(facilityId: string, month: string, value: RawMonthResult): Promise<void>;
    getSnapshot(email: string): Promise<AvailabilitySnapshot | null>;
    putSnapshot(email: string, value: AvailabilitySnapshot): Promise<void>;
    deleteSnapshot(email: string): Promise<void>;
}
