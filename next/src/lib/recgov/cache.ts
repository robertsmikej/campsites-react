import type { Campground } from "@/types/campground";
import type { RawMonthResult, SiteAvailabilityMap } from "./types";

// Long TTL is intentional: the notifier always force-fetches fresh data each
// cycle and only writes back when content actually changed (see putRaw in the
// KV adapters). A long TTL lets identical-content data survive between cycles
// without burning a write per cycle. Dashboard reads serve from this cache.
export const RAW_CACHE_TTL_SECONDS = 60 * 60;
// 3 minutes: bounds how stale a dashboard read can be. On-demand rebuilds are
// cheap because the raw month cache underneath (RAW_CACHE_TTL_SECONDS) is kept
// warm by the notifier's 1-min tick / 5-min sweep, so a rebuild is cache-only.
// The 5-min sweep is the true floor for normal-tier data; a shorter TTL just
// re-serves identical data, so 3 min biases fresh without pointless churn.
export const SNAPSHOT_CACHE_TTL_SECONDS = 3 * 60;

export const rawCacheKey = (facilityId: string, month: string): string => `recgov:${facilityId}:${month}`;

export const snapshotCacheKey = (email: string): string => `snapshot:${email}`;

// Snapshot value shape — the data the dashboard ultimately consumes.
// Embeds the source Campground config (so the dashboard has image/dates/ratings/etc.
// without a separate config fetch) plus the processed availability for this poll
// cycle. Site availability is filtered to sites with at least one match;
// totalSitesCount tracks the original site total before filtering.
export interface SnapshotCampground extends Campground {
    siteAvailability: SiteAvailabilityMap;
    totalSitesCount: number;
    adjacentGroups?: import("../adjacent-groups").AdjacentGroup[];
    tripMatches?: import("../trip-windows").TripSiteHit[];
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
