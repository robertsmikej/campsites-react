import { describe, it, expect } from "vitest";
import {
    findConsecutiveAvailableRanges,
    getAllDatesInRange,
    getSiteFetchMap,
} from "./recreation-gov";

describe("getAllDatesInRange", () => {
    it("includes both endpoints", () => {
        expect(getAllDatesInRange("2026-05-01", "2026-05-03")).toEqual([
            "2026-05-01",
            "2026-05-02",
            "2026-05-03",
        ]);
    });

    it("returns just the start date when start === end", () => {
        expect(getAllDatesInRange("2026-05-27", "2026-05-27")).toEqual(["2026-05-27"]);
    });
});

describe("findConsecutiveAvailableRanges", () => {
    it("finds a single 1-night range from a lone available date", () => {
        const ranges = findConsecutiveAvailableRanges(["2026-05-27"], 1);
        expect(ranges).toEqual([["2026-05-27", "2026-05-28"]]);
    });

    it("finds a 2-night range from three consecutive dates without overlap", () => {
        // Three consecutive days [a, a+1, a+2] with length=2 → two non-overlapping 2-night ranges
        // starting at index 0 and index 2.
        // Actually: starting at index 0 it consumes [0,1]; then i jumps to 2 — but there's only [2] left,
        // not enough for length=2. So result is just [["2026-05-27", "2026-05-29"]].
        const ranges = findConsecutiveAvailableRanges(
            ["2026-05-27", "2026-05-28", "2026-05-29"],
            2,
        );
        expect(ranges).toEqual([["2026-05-27", "2026-05-29"]]);
    });

    it("returns nothing when there's a gap", () => {
        expect(findConsecutiveAvailableRanges(["2026-05-27", "2026-05-29"], 2)).toEqual([]);
    });
});

describe("getSiteFetchMap", () => {
    it("skips campgrounds where enabled === false", () => {
        const sites = {
            "recreation.gov": [
                {
                    id: "1",
                    name: "Enabled",
                    sites: { favorites: [], worthwhile: [] },
                    dates: { startDate: "2026-06-01", endDate: "2026-06-02" },
                },
                {
                    id: "2",
                    name: "Disabled",
                    enabled: false,
                    sites: { favorites: [], worthwhile: [] },
                    dates: { startDate: "2026-06-01", endDate: "2026-06-02" },
                },
            ],
        };
        const settings = { dates: { startDate: "2026-06-01", endDate: "2026-06-02" } };
        const map = getSiteFetchMap(sites as never, settings as never);
        expect(map.map((m) => m.campground.id)).toEqual(["1"]);
    });

    it("emits one entry per month spanned by the date range", () => {
        const sites = {
            "recreation.gov": [
                {
                    id: "1",
                    name: "Two months",
                    sites: { favorites: [], worthwhile: [] },
                    dates: { startDate: "2026-05-30", endDate: "2026-06-02" },
                },
            ],
        };
        const settings = { dates: {} };
        const map = getSiteFetchMap(sites as never, settings as never);
        expect(map.map((m) => m.month).sort()).toEqual(["2026-05", "2026-06"]);
    });
});
