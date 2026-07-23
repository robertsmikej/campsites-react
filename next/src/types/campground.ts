import type { AdjacentGroup } from "../lib/adjacent-groups";

export type CampgroundSystem = "recreation.gov";

export type { AdjacentGroup };

export interface SiteAvailability {
    siteId: string;
    siteName: string;
    loop?: string;
    dates: string[];
    matches: StayMatch[];
    excludedMatches: ExcludedStay[];
    photos?: string[];
    photo?: string;
    campsite_type?: string;
    max_num_people?: number;
    max_vehicle_length?: number;
}

export interface StayMatch {
    from: string;
    to: string;
    nights: number;
}

export interface ExcludedStay extends StayMatch {
    excluded: true;
    reason: "stayLength" | "startDay";
}

export interface CampgroundDates {
    startDate?: string;
    endDate?: string;
}

export interface CampgroundShowOrHide {
    Favorites: boolean;
    Worthwhile: boolean;
    "All Others": boolean;
}

export type CampgroundType = "campground" | "cabin" | "lookout";

export type NotifyScope = "favorites" | "worthwhile" | "all";
export const NOTIFY_SCOPES: readonly NotifyScope[] = ["favorites", "worthwhile", "all"] as const;

export type CheckPriority = "high" | "normal" | "low";
/** Minutes between notifier checks for each tier. */
export const CHECK_PRIORITY_INTERVAL_MINUTES: Readonly<Record<CheckPriority, number>> = {
    high: 1,
    normal: 5,
    low: 10,
};
/** Max campgrounds a user may set to "high" (every-minute) checking. */
export const HIGH_PRIORITY_CAP = 3;

export interface Campground {
    id: string;
    name: string;
    area?: string;
    site?: string;
    type?: CampgroundType | string;
    description?: string;
    dates?: CampgroundDates;
    image?: string;
    mapImage?: string;
    sites: { favorites: string[]; worthwhile: string[] };
    showOrHide?: Partial<CampgroundShowOrHide>;
    /** Which sites at this campground should trigger an email. Falls back
     *  through `notifyAll` (legacy) and the user's defaultNotifyScope. */
    notifyScope?: NotifyScope;
    /** Adjacent-site group alerts. Absent = off. Anchor scope mirrors NotifyScope:
     *  "favorites" requires a favorite in the group, "worthwhile" a fav-or-worthwhile,
     *  "all" no anchor requirement. */
    adjacencyAnchor?: NotifyScope;
    /** @deprecated use notifyScope. true == "all". */
    notifyAll?: boolean;
    /** How often the notifier checks this campground. Absent = "normal" (every 5 min). */
    checkPriority?: CheckPriority;
    enabled?: boolean;
    validStartDays?: string[];
    stayLengths?: number[];
    /** ISO timestamp of when this campground was added to the list. On the
     *  curator's record this dates curator additions to the default, which is
     *  how the "recently added" nudge decides what's new to a user. Absent on
     *  pre-existing entries — those are treated as old (never flagged new). */
    addedAt?: string;
}

export interface ProcessedCampground extends Campground {
    siteAvailability: Record<string, SiteAvailability>;
    totalSitesCount?: number;
    sitesGroupedByFavorites?: {
        Favorites: SiteAvailability[];
        Worthwhile: SiteAvailability[];
        "All Others": SiteAvailability[];
    };
    excludedMatches?: {
        byStayLength: number;
        byStartDay: number;
        sites: Record<string, { siteId: string; byStayLength: number; byStartDay: number }>;
    };
    hasAvailability?: boolean;
    adjacentGroups?: AdjacentGroup[];
    /** Sites that can host a trip window (server-computed; see lib/trip-windows). */
    tripMatches?: import("../lib/trip-windows").TripSiteHit[];
}

/** A user-level "I'm busy/booked" range. Inclusive calendar days, ISO dates. */
export interface BlackoutRange {
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD, >= from
    label?: string;
}

/** A user-level "I want to camp these dates" range. `from` is
 *  arrival, `to` is checkout, so the nights are the half-open [from, to) (unlike BlackoutRange,
 *  which is inclusive days). Openings covering the flex-shrunk core trigger
 *  boosted "trip match" alerts: notify scope bypassed, 6h re-alert cadence,
 *  one digest push per window. */
export interface TripWindow {
    /** crypto.randomUUID() at creation; keys dedup state and push tags. */
    id: string;
    from: string; // YYYY-MM-DD arrival (first night)
    to: string; // YYYY-MM-DD departure/checkout, > from
    label?: string; // <= 80 chars
    /** Each end may shrink by up to this many days (default 0, max 3). */
    flexDays?: number;
    /** Restrict to these watched campground ids. Absent/empty = all. */
    campgroundIds?: string[];
}

export interface GlobalSettings {
    stayLengths: number[];
    validStartDays: string[];
    /** Dates the user can't camp: greyed in views, excluded from the planner,
     *  and alert emails are suppressed for stays overlapping these nights. */
    blackoutDates?: BlackoutRange[];
    /** Dates the user is actively trying to book. See TripWindow. */
    tripWindows?: TripWindow[];
}

export interface SiteConfig {
    "recreation.gov": Campground[];
}

export interface ApiConfigResponse {
    campgrounds: SiteConfig;
    globalSettings?: GlobalSettings;
}

export interface CampgroundsBySystem {
    "recreation.gov"?: ProcessedCampground[];
}
