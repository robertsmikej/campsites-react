import { describe, it, expect } from "vitest";
import {
    formatToMMDDYYYY,
    getDayOfWeek,
    getEmptyGroupedSites,
    deepMerge,
    buildReservationLink,
    overlayConfigRatings,
} from "./campground-utils";
import type { ProcessedCampground } from "@/types/campground";

function processed(id: string, favorites: string[], worthwhile: string[] = []): ProcessedCampground {
    return {
        id,
        name: `cg-${id}`,
        sites: { favorites, worthwhile },
        siteAvailability: {},
    } as unknown as ProcessedCampground;
}

describe("formatToMMDDYYYY", () => {
    it("converts ISO date to MM/DD/YYYY", () => {
        expect(formatToMMDDYYYY("2026-05-15")).toBe("05/15/2026");
    });
});

describe("getDayOfWeek", () => {
    it("returns short day name by default", () => {
        expect(getDayOfWeek("2026-05-15")).toBe("Fri");
    });
    it("returns long day name when longForm=true", () => {
        expect(getDayOfWeek("2026-05-15", true, true)).toBe("Friday");
    });
    it("returns numeric day when returnString=false", () => {
        expect(getDayOfWeek("2026-05-15", false)).toBe(5);
    });
});

describe("getEmptyGroupedSites", () => {
    it("returns the three section buckets", () => {
        expect(getEmptyGroupedSites()).toEqual({
            Favorites: [],
            Worthwhile: [],
            "All Others": [],
        });
    });
});

describe("deepMerge", () => {
    it("merges nested objects without overwriting siblings", () => {
        type AB = { a: Record<string, number> };
        expect(deepMerge<AB>({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({ a: { x: 1, y: 2 } });
    });
    it("overrides primitives", () => {
        expect(deepMerge<{ a: number }>({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });
});

describe("buildReservationLink", () => {
    it("builds a recreation.gov reservation URL", () => {
        const url = buildReservationLink("69080", "2026-05-27", 2);
        expect(url).toBe(
            "https://www.recreation.gov/camping/campsites/69080?arrivalDate=2026-05-27&departureDate=2026-05-29",
        );
    });
});

describe("overlayConfigRatings", () => {
    it("replaces a campground's favorites/worthwhile with the live config by id", () => {
        // The snapshot embeds a stale copy of sites; the live config is authoritative.
        const data = { "recreation.gov": [processed("234007", ["001"], ["002"])] };
        const ratings = new Map([["234007", { favorites: ["011", "008"], worthwhile: ["009"] }]]);

        const out = overlayConfigRatings(data, ratings);

        expect(out["recreation.gov"]![0]!.sites).toEqual({
            favorites: ["011", "008"],
            worthwhile: ["009"],
        });
    });

    it("leaves campgrounds without a config entry untouched", () => {
        const data = { "recreation.gov": [processed("99", ["005"])] };
        const out = overlayConfigRatings(data, new Map([["234007", { favorites: ["x"], worthwhile: [] }]]));
        expect(out["recreation.gov"]![0]!.sites.favorites).toEqual(["005"]);
    });

    it("returns the input unchanged when there are no ratings", () => {
        const data = { "recreation.gov": [processed("1", ["a"])] };
        expect(overlayConfigRatings(data, new Map())).toBe(data);
    });
});
