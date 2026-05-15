import type { Campground, CampgroundShowOrHide, GlobalSettings, SiteConfig } from "@/types/campground";

export const CUSTOM_CATALOG_OPTION = "__custom" as const;

export interface EditableCampground extends Campground {
    favoritesText: string;
    worthwhileText: string;
    favoritesArray: string[];
    worthwhileArray: string[];
    catalogId: string;
    showOrHide: CampgroundShowOrHide;
}

export interface SiteConfigDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (config: SiteConfig, globalSettings: GlobalSettings) => void;
    onResetToDefaults: () => void;
    initialData: SiteConfig;
    catalogOptions: Array<{
        system: "recreation.gov";
        id: string;
        name: string;
        area?: string;
        image?: string;
        description?: string;
        type?: string;
        site?: string;
    }>;
    globalSettings: GlobalSettings;
    availableSites: Record<string, string[]>;
    useMockData: boolean;
    onToggleMockData: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ALL_DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

export const DEFAULT_STAY_RANGE: [number, number] = [2, 5];
export const STAY_MIN = 1;
export const STAY_MAX = 14;

export const DEFAULT_SHOW_HIDE: CampgroundShowOrHide = {
    Favorites: true,
    Worthwhile: true,
    "All Others": false,
};
