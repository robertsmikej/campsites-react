import { describe, it, expect } from "vitest";
import {
    getAllDatesInRange,
    findConsecutiveAvailableRanges,
    processCampgroundResults,
} from "./match-detection";
import type { RawMonthResult } from "./types";

describe("getAllDatesInRange", () => {
    it("returns inclusive date list", () => {
        const result = getAllDatesInRange("2026-07-01", "2026-07-03");
        expect(result).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    });

    it("returns single-element list when start === end", () => {
        const result = getAllDatesInRange("2026-07-01", "2026-07-01");
        expect(result).toEqual(["2026-07-01"]);
    });
});

describe("findConsecutiveAvailableRanges", () => {
    it("finds 2-night range from 3 consecutive dates", () => {
        const result = findConsecutiveAvailableRanges(["2026-07-01", "2026-07-02", "2026-07-03"], 2);
        expect(result).toEqual([["2026-07-01", "2026-07-03"]]);
    });

    it("skips when dates are not consecutive", () => {
        const result = findConsecutiveAvailableRanges(["2026-07-01", "2026-07-03"], 2);
        expect(result).toEqual([]);
    });
});

describe("processCampgroundResults", () => {
    it("filters by stay length and start day", () => {
        const apiResult: RawMonthResult = {
            campsites: {
                "site-1": {
                    site: "001",
                    campsite_type: "STANDARD",
                    availabilities: {
                        "2026-07-03T00:00:00Z": "Available", // Friday
                        "2026-07-04T00:00:00Z": "Available", // Saturday
                        "2026-07-05T00:00:00Z": "Available", // Sunday
                    },
                },
            },
        };
        const allDates = ["2026-07-03", "2026-07-04", "2026-07-05"];
        const result = processCampgroundResults([apiResult], allDates, {
            stayLengths: [2],
            validStartDays: ["Friday"],
        });
        expect(result["site-1"]?.matches).toEqual([{ from: "2026-07-03", to: "2026-07-05", nights: 2 }]);
    });

    it("excludes IGNORE_CAMPSITE_TYPES", () => {
        const apiResult: RawMonthResult = {
            campsites: {
                "site-1": {
                    site: "001",
                    campsite_type: "DAY USE",
                    availabilities: {
                        "2026-07-03T00:00:00Z": "Available",
                        "2026-07-04T00:00:00Z": "Available",
                    },
                },
            },
        };
        const result = processCampgroundResults([apiResult], ["2026-07-03", "2026-07-04"], {
            stayLengths: [1],
            validStartDays: ["Friday"],
        });
        expect(result["site-1"]).toBeUndefined();
    });

    it("returns empty map when no campsites match window", () => {
        const apiResult: RawMonthResult = { campsites: {} };
        const result = processCampgroundResults([apiResult], ["2026-07-03"], {
            stayLengths: [1],
            validStartDays: ["Friday"],
        });
        expect(result).toEqual({});
    });
});
