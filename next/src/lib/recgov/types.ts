// Shared types for rec.gov availability fetching and match detection.
// Used by both the Next.js worker route and the notifier (Cloudflare Worker).

import type { StayMatch } from "@/types/campground";
export type { StayMatch };

export const IGNORE_CAMPSITE_TYPES = ["GROUP SHELTER NONELECTRIC", "WALK TO", "DAY USE"];

// Identifying User-Agent for every recreation.gov request (availability polling
// plus the search/details/sites lookups). Honest — names the app and gives a URL
// and contact — so our polling profile is attributable rather than an anonymous
// bot, which is the profile most likely to get silently IP-blocked.
export const REC_GOV_USER_AGENT = "CampWatch/1.0 (+https://campwatch.dev; hello@campwatch.dev)";

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
