import { describe, it, expect } from "vitest";
import {
    formatToMMDDYYYY,
    getDayOfWeek,
    getEmptyGroupedSites,
    deepMerge,
    buildReservationLink,
} from "./campground-utils";

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
