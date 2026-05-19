import type { Campground, CampgroundShowOrHide, GlobalSettings, SiteConfig } from "@/types/campground";

export interface EditableCampground extends Campground {
    favoritesText: string;
    worthwhileText: string;
    favoritesArray: string[];
    worthwhileArray: string[];
    showOrHide: CampgroundShowOrHide;
}

export interface SiteConfigDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (config: SiteConfig, globalSettings: GlobalSettings) => void;
    onResetToDefaults: () => void;
    initialData: SiteConfig;
    globalSettings: GlobalSettings;
    availableSites: Record<string, string[]>;
    useMockData: boolean;
    onToggleMockData: (event: React.ChangeEvent<HTMLInputElement>) => void;
    /** When set, the dialog scrolls to and expands this campground on open. */
    focusedCampgroundId?: string | null;
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
