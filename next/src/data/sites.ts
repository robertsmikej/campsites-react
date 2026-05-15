import type { Campground, SiteConfig } from "@/types/campground";
import { campgroundCatalog } from "./campground-catalog";
import { defaultCampgroundConfigurations } from "./site-configurations";
import { deepMerge } from "@/lib/campground-utils";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function indexById(entries: Campground[] = []): Record<string, Campground> {
    return entries.reduce((acc, entry) => {
        if (entry?.id) acc[entry.id] = entry;
        return acc;
    }, {} as Record<string, Campground>);
}

export function mergeCatalogWithConfigurations(
    catalog: SiteConfig = campgroundCatalog,
    configs: SiteConfig = defaultCampgroundConfigurations,
): SiteConfig {
    const merged: SiteConfig = { "recreation.gov": [] };
    const systemConfigs = indexById(configs["recreation.gov"] ?? []);

    merged["recreation.gov"] = catalog["recreation.gov"].map((campground) => {
        const base = clone(campground);
        const overrides = systemConfigs[campground.id];
        if (!overrides) return base;
        return deepMerge(base as unknown as Record<string, unknown>, clone(overrides) as unknown as Record<string, unknown>) as unknown as Campground;
    });

    return merged;
}

export const sites = mergeCatalogWithConfigurations();
