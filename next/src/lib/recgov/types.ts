// Shared types for rec.gov availability fetching and match detection.
// Used by both the Next.js worker route and the notifier (GitHub Actions).

import type { StayMatch } from "@/types/campground";
export type { StayMatch };

export const IGNORE_CAMPSITE_TYPES = ["GROUP SHELTER NONELECTRIC", "WALK TO", "DAY USE"];

export interface SiteAvailabilityRaw {
    siteId: string;
    siteName: string;
    campsite_type: string;
    dates: string[];
    matches?: StayMatch[];
}

// Keyed by siteId.
export type SiteAvailabilityMap = Record<string, SiteAvailabilityRaw>;

// Partial shape of rec.gov's per-month response — only the fields we read.
export interface RawSiteData {
    site: string;
    campsite_type: string;
    availabilities: Record<string, string>;
}

export interface RawMonthResult {
    campsites?: Record<string, RawSiteData>;
}

export interface ProcessSettings {
    stayLengths?: number[];
    validStartDays?: string[];
}
