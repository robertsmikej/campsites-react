import { describe, it, expect } from "vitest";
import { buildDefaultFromCatalog, DEFAULT_GLOBAL_SETTINGS } from "./build-default";
import { campgroundCatalog } from "./campground-catalog";
import { defaultCampgroundConfigurations } from "./site-configurations";

describe("buildDefaultFromCatalog", () => {
    it("includes every campground in the catalog", () => {
        const { campgrounds } = buildDefaultFromCatalog();
        const catalogIds = (campgroundCatalog["recreation.gov"] ?? []).map((c) => c.id);
        const resultIds = campgrounds["recreation.gov"].map((c) => c.id);
        expect(resultIds.sort()).toEqual(catalogIds.sort());
    });

    it("merges defaultCampgroundConfigurations overrides onto catalog entries", () => {
        const { campgrounds } = buildDefaultFromCatalog();
        const configWithOverrides = (defaultCampgroundConfigurations["recreation.gov"] ?? []).filter(
            (c) => c.sites.favorites.length > 0,
        );
        for (const cfg of configWithOverrides) {
            const result = campgrounds["recreation.gov"].find((c) => c.id === cfg.id);
            expect(result?.sites.favorites).toEqual(cfg.sites.favorites);
        }
    });

    it("preserves catalog-only fields (name, area, description, mapImage) when no override exists", () => {
        const { campgrounds } = buildDefaultFromCatalog();
        for (const catalogEntry of campgroundCatalog["recreation.gov"] ?? []) {
            const result = campgrounds["recreation.gov"].find((c) => c.id === catalogEntry.id);
            expect(result?.name).toBe(catalogEntry.name);
            expect(result?.area).toBe(catalogEntry.area);
            if (catalogEntry.mapImage) {
                expect(result?.mapImage).toBe(catalogEntry.mapImage);
            }
        }
    });

    it("returns DEFAULT_GLOBAL_SETTINGS", () => {
        const { globalSettings } = buildDefaultFromCatalog();
        expect(globalSettings).toEqual(DEFAULT_GLOBAL_SETTINGS);
    });

    it("DEFAULT_GLOBAL_SETTINGS includes all 7 days", () => {
        expect(DEFAULT_GLOBAL_SETTINGS.validStartDays).toHaveLength(7);
        expect(DEFAULT_GLOBAL_SETTINGS.stayLengths).toEqual([2, 3, 4, 5]);
    });
});
