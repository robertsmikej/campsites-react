import type { Campground, GlobalSettings, SiteConfig } from "@/types/campground";
import { campgroundCatalog } from "./campground-catalog";
import { defaultCampgroundConfigurations } from "./site-configurations";

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

export function buildDefaultFromCatalog(): { campgrounds: SiteConfig; globalSettings: GlobalSettings } {
    const merged = (campgroundCatalog["recreation.gov"] ?? []).map((c) => {
        const cfg = (defaultCampgroundConfigurations["recreation.gov"] ?? []).find((x) => x.id === c.id);
        return { ...c, ...(cfg ?? {}) } as Campground;
    });
    return {
        campgrounds: { "recreation.gov": merged },
        globalSettings: DEFAULT_GLOBAL_SETTINGS,
    };
}
