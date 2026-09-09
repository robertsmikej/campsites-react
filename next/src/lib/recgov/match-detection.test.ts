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

    it("finds a valid start day hidden inside a rejected window", () => {
        // Fri Jul 3, Sat Jul 4, Sun Jul 5 2026 are open. A Saturday-only 2-night
        // stay is Sat->Mon. The greedy skip used to consume Fri->Sun and miss it.
        const saturdaysOnly = (from: string): boolean => from === "2026-07-04";
        const result = findConsecutiveAvailableRanges(
            ["2026-07-03", "2026-07-04", "2026-07-05"],
            2,
            saturdaysOnly,
        );
        expect(result).toEqual([["2026-07-04", "2026-07-06"]]);
    });

    it("still reports one window per block when every start is valid", () => {
        const result = findConsecutiveAvailableRanges(
            ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"],
            2,
            () => true,
        );
        expect(result).toEqual([
            ["2026-07-01", "2026-07-03"],
            ["2026-07-03", "2026-07-05"],
        ]);
    });
});

describe("processCampgroundResults with restricted start days", () => {
    it("matches a Saturday start that begins inside a Friday-start window", () => {
        const apiResult: RawMonthResult = {
            campsites: {
                "site-9": {
                    site: "009",
                    campsite_type: "STANDARD",
                    availabilities: {
                        "2026-07-03T00:00:00Z": "Available",
                        "2026-07-04T00:00:00Z": "Available",
                        "2026-07-05T00:00:00Z": "Available",
                    },
                },
            },
        } as unknown as RawMonthResult;
        const allDates = getAllDatesInRange("2026-07-01", "2026-07-31");
        const result = processCampgroundResults([apiResult], allDates, {
            stayLengths: [2],
            validStartDays: ["Saturday"],
        });
        expect(result["site-9"]?.matches).toEqual([{ from: "2026-07-04", to: "2026-07-06", nights: 2 }]);
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
