import { describe, it, expect } from "vitest";
import {
    buildVariantMap,
    buildDateDisplayArray,
    getMonthsFromSiteData,
} from "./campsites-calendar-helpers";
import type { SiteAvailability } from "@/types/campground";

// ---------------------------------------------------------------------------
// buildVariantMap
// ---------------------------------------------------------------------------

describe("buildVariantMap", () => {
    it("marks a single-day match as 'single'", () => {
        const map = buildVariantMap([{ from: "2026-05-27", to: "2026-05-27" }]);
        expect(map.get("2026-05-27")).toBe("single");
    });

    it("marks a 3-day match as rangeStart/middle/end", () => {
        const map = buildVariantMap([{ from: "2026-05-27", to: "2026-05-29" }]);
        expect(map.get("2026-05-27")).toBe("rangeStart");
        expect(map.get("2026-05-28")).toBe("rangeMiddle");
        expect(map.get("2026-05-29")).toBe("rangeEnd");
    });

    it("paints excluded ranges with the 'excluded' prefix", () => {
        const map = buildVariantMap([{ from: "2026-05-27", to: "2026-05-27", excluded: true }]);
        expect(map.get("2026-05-27")).toBe("excludedSingle");
    });

    it("paints soft ranges with the 'soft' prefix", () => {
        const map = buildVariantMap([{ from: "2026-05-27", to: "2026-05-29", soft: true }]);
        expect(map.get("2026-05-27")).toBe("softRangeStart");
        expect(map.get("2026-05-28")).toBe("softRangeMiddle");
        expect(map.get("2026-05-29")).toBe("softRangeEnd");
    });

    it("regular matches win over soft when overlapping", () => {
        const map = buildVariantMap([
            { from: "2026-05-27", to: "2026-05-27", soft: true },
            { from: "2026-05-27", to: "2026-05-27" },
        ]);
        expect(map.get("2026-05-27")).toBe("single");
    });

    it("soft wins over excluded when overlapping", () => {
        const map = buildVariantMap([
            { from: "2026-05-27", to: "2026-05-27", excluded: true },
            { from: "2026-05-27", to: "2026-05-27", soft: true },
        ]);
        expect(map.get("2026-05-27")).toBe("softSingle");
    });

    it("two-day range has no middle days", () => {
        const map = buildVariantMap([{ from: "2026-05-27", to: "2026-05-28" }]);
        expect(map.get("2026-05-27")).toBe("rangeStart");
        expect(map.get("2026-05-28")).toBe("rangeEnd");
        // No middle entry exists
        expect(map.size).toBe(2);
    });

    it("returns empty map for empty input", () => {
        const map = buildVariantMap([]);
        expect(map.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// buildDateDisplayArray
// ---------------------------------------------------------------------------

describe("buildDateDisplayArray", () => {
    it("returns a single soft entry for an available day with no matches", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-05-27"],
            matches: [],
            excludedMatches: [],
        };
        const result = buildDateDisplayArray(site, false);
        // CRA: singles are `{ from: d, to: dayjs(d).add(1, 'day'), soft: true }`
        expect(result.some((r) => r.soft && r.from === "2026-05-27")).toBe(true);
    });

    it("the soft entry for a lone date has to = from + 1 day", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-05-27"],
            matches: [],
            excludedMatches: [],
        };
        const result = buildDateDisplayArray(site, false);
        const entry = result.find((r) => r.soft && r.from === "2026-05-27");
        expect(entry?.to).toBe("2026-05-28");
    });

    it("does not produce a soft single for a date already covered by a match", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-05-27"],
            matches: [{ from: "2026-05-27", to: "2026-05-28", nights: 1 }],
            excludedMatches: [],
        };
        const result = buildDateDisplayArray(site, false);
        // The match covers 2026-05-27 so no soft single for it
        const softEntry = result.find((r) => r.soft && r.from === "2026-05-27");
        expect(softEntry).toBeUndefined();
        // But the regular match range is present
        expect(result.some((r) => !r.soft && !r.excluded && r.from === "2026-05-27")).toBe(true);
    });

    it("includes startDay-excluded as soft regardless of includeExcluded flag", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [
                { from: "2026-05-27", to: "2026-05-29", nights: 2, excluded: true, reason: "startDay" },
            ],
        };
        const withoutFlag = buildDateDisplayArray(site, false);
        expect(withoutFlag.some((r) => r.soft && r.from === "2026-05-27")).toBe(true);
        const withFlag = buildDateDisplayArray(site, true);
        expect(withFlag.some((r) => r.soft && r.from === "2026-05-27")).toBe(true);
    });

    it("only includes stayLength-excluded when includeExcluded is true", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [
                { from: "2026-06-01", to: "2026-06-03", nights: 2, excluded: true, reason: "stayLength" },
            ],
        };
        const withoutFlag = buildDateDisplayArray(site, false);
        expect(withoutFlag.some((r) => r.excluded && r.from === "2026-06-01")).toBe(false);
        const withFlag = buildDateDisplayArray(site, true);
        expect(withFlag.some((r) => r.excluded && r.from === "2026-06-01")).toBe(true);
    });

    it("result is sorted by from date", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-07-01", "2026-05-01"],
            matches: [],
            excludedMatches: [],
        };
        const result = buildDateDisplayArray(site, false);
        const froms = result.map((r) => r.from);
        const sorted = [...froms].sort();
        expect(froms).toEqual(sorted);
    });
});

// ---------------------------------------------------------------------------
// getMonthsFromSiteData
// ---------------------------------------------------------------------------

describe("getMonthsFromSiteData", () => {
    it("returns the first day of each month with data", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-05-27", "2026-07-15"],
            matches: [],
            excludedMatches: [],
        };
        const months = getMonthsFromSiteData(site, false);
        expect(months).toContain("2026-05-01");
        expect(months).toContain("2026-07-01");
    });

    it("includes months spanned by a multi-month match range", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [{ from: "2026-05-28", to: "2026-07-02", nights: 35 }],
            excludedMatches: [],
        };
        const months = getMonthsFromSiteData(site, false);
        expect(months).toContain("2026-05-01");
        expect(months).toContain("2026-06-01");
        expect(months).toContain("2026-07-01");
    });

    it("does not include stayLength-excluded months when flag is false", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [
                { from: "2026-08-01", to: "2026-08-03", nights: 2, excluded: true, reason: "stayLength" },
            ],
        };
        const months = getMonthsFromSiteData(site, false);
        expect(months).not.toContain("2026-08-01");
    });

    it("includes stayLength-excluded months when flag is true", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [
                { from: "2026-08-01", to: "2026-08-03", nights: 2, excluded: true, reason: "stayLength" },
            ],
        };
        const months = getMonthsFromSiteData(site, true);
        expect(months).toContain("2026-08-01");
    });

    it("always includes startDay-excluded months", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [
                { from: "2026-09-05", to: "2026-09-07", nights: 2, excluded: true, reason: "startDay" },
            ],
        };
        const months = getMonthsFromSiteData(site, false);
        expect(months).toContain("2026-09-01");
    });

    it("returns sorted months with no duplicates", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: ["2026-05-01", "2026-05-15"],
            matches: [{ from: "2026-05-10", to: "2026-05-12", nights: 2 }],
            excludedMatches: [],
        };
        const months = getMonthsFromSiteData(site, false);
        expect(months).toEqual(["2026-05-01"]);
    });

    it("returns empty array for site with no data", () => {
        const site: SiteAvailability = {
            siteId: "1",
            siteName: "A",
            dates: [],
            matches: [],
            excludedMatches: [],
        };
        expect(getMonthsFromSiteData(site, false)).toEqual([]);
    });
});
