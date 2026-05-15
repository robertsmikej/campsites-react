export type CampgroundSystem = "recreation.gov";

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

export interface Campground {
    id: string;
    name: string;
    area?: string;
    site?: string;
    type?: CampgroundType | string;
    description?: string;
    dates?: CampgroundDates;
    image?: string;
    sites: { favorites: string[]; worthwhile: string[] };
    showOrHide?: Partial<CampgroundShowOrHide>;
    notifyAll?: boolean;
    enabled?: boolean;
    validStartDays?: string[];
    stayLengths?: number[];
}

export interface ProcessedCampground extends Campground {
    siteAvailability: Record<string, SiteAvailability>;
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
}

export interface GlobalSettings {
    stayLengths: number[];
    validStartDays: string[];
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
