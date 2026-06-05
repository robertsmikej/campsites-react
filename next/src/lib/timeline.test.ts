import { describe, it, expect } from "vitest";
import {
    buildHorizon,
    dayIndexOf,
    pct,
    isWeekendNight,
    campgroundRuns,
    siteOpenRuns,
    siteTier,
    rangeLabel,
    monthTicks,
    nowIndex,
} from "./timeline";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

const HORIZON = buildHorizon(new Date(2026, 4, 1), new Date(2026, 8, 30)); // May 1 – Sep 30 2026

function site(siteName: string, matches: Array<[string, string]>): SiteAvailability {
    return {
        siteId: `id-${siteName}`,
        siteName,
        dates: [],
        excludedMatches: [],
        matches: matches.map(([from, to]) => ({
            from,
            to,
            nights: Math.round((+new Date(to) - +new Date(from)) / 86400000),
        })),
    };
}

describe("buildHorizon / dayIndexOf / pct", () => {
    it("counts inclusive days and indexes by date", () => {
        expect(HORIZON.totalDays).toBe(153); // May(31)+Jun(30)+Jul(31)+Aug(31)+Sep(30)
        expect(dayIndexOf(HORIZON, "2026-05-01")).toBe(0);
        expect(dayIndexOf(HORIZON, "2026-05-02")).toBe(1);
        expect(dayIndexOf(HORIZON, "2026-09-30")).toBe(152);
    });
    it("pct maps index to percent of axis", () => {
        expect(pct(HORIZON, 0)).toBe(0);
        expect(pct(HORIZON, HORIZON.totalDays)).toBe(100);
    });
});

describe("isWeekendNight", () => {
    it("is true only for Fri and Sat", () => {
        expect(isWeekendNight(new Date(2026, 4, 1))).toBe(true); // Fri May 1 2026
        expect(isWeekendNight(new Date(2026, 4, 2))).toBe(true); // Sat
        expect(isWeekendNight(new Date(2026, 4, 3))).toBe(false); // Sun
    });
});

describe("siteTier", () => {
    const cg = { sites: { favorites: ["A-07"], worthwhile: ["B-23"] } } as ProcessedCampground;
    it("classifies by site name", () => {
        expect(siteTier(cg, "A-07")).toBe("fav");
        expect(siteTier(cg, "B-23")).toBe("worth");
        expect(siteTier(cg, "C-31")).toBe("other");
    });
});

describe("siteOpenRuns", () => {
    it("converts matches to inclusive night index ranges, merging adjacency", () => {
        // arrival May 23, departure May 25 -> nights May23,May24 -> idx [22,23]
        const s = site("A-07", [["2026-05-23", "2026-05-25"]]);
        expect(siteOpenRuns(HORIZON, s)).toEqual([[22, 23]]);
    });
    it("merges touching ranges", () => {
        const s = site("A-07", [
            ["2026-05-23", "2026-05-25"], // idx 22,23
            ["2026-05-25", "2026-05-27"], // idx 24,25 -> touches -> merge
        ]);
        expect(siteOpenRuns(HORIZON, s)).toEqual([[22, 25]]);
    });
    it("returns [] when the site has no matches in the horizon", () => {
        expect(siteOpenRuns(HORIZON, site("C-31", []))).toEqual([]);
    });
});

describe("campgroundRuns", () => {
    it("marks a night open when >=3 sites cover it, limited when 1-2", () => {
        const cg = {
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {
                a: site("a", [["2026-05-10", "2026-05-11"]]),
                b: site("b", [["2026-05-10", "2026-05-11"]]),
                c: site("c", [["2026-05-10", "2026-05-11"]]), // 3 sites on May 10 -> open
                d: site("d", [["2026-05-12", "2026-05-13"]]), // 1 site on May 12 -> limited
            },
        } as unknown as ProcessedCampground;
        const { open, limited, openNights } = campgroundRuns(HORIZON, cg);
        expect(open).toEqual([[9, 9]]); // May 10 night
        expect(limited).toEqual([[11, 11]]); // May 12 night
        expect(openNights).toBe(1);
    });
});

describe("rangeLabel", () => {
    it("same month", () => expect(rangeLabel(HORIZON, 22, 23)).toBe("May 23–24"));
    it("single night", () => expect(rangeLabel(HORIZON, 22, 22)).toBe("May 23"));
    it("cross month", () => expect(rangeLabel(HORIZON, 30, 31)).toBe("May 31–Jun 1"));
});

describe("monthTicks / nowIndex", () => {
    it("emits a tick per month in the horizon, first at index 0", () => {
        const ticks = monthTicks(HORIZON);
        expect(ticks.map((t) => t.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep"]);
        expect(ticks[0]!.index).toBe(0);
        expect(ticks[1]!.index).toBe(31); // Jun 1 is 31 nights after May 1
    });
    it("nowIndex is null outside the horizon, an index inside", () => {
        expect(nowIndex(HORIZON, new Date(2025, 0, 1))).toBeNull();
        expect(nowIndex(HORIZON, new Date(2026, 4, 11))).toBe(10);
    });
});
