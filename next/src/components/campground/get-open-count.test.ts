import { describe, it, expect } from "vitest";
import { getCampgroundOpenCount, toLocalIso } from "./get-open-count";
import type { ProcessedCampground } from "@/types/campground";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCampground(matches: { from: string; to: string }[]): ProcessedCampground {
    return {
        id: "1",
        name: "Test Camp",
        sites: { favorites: [], worthwhile: [] },
        siteAvailability: {
            site1: {
                siteId: "site1",
                siteName: "Site 1",
                dates: [],
                matches: matches.map((m) => ({ ...m, nights: 1 })),
                excludedMatches: [],
            },
        },
    };
}

// ─── toLocalIso ──────────────────────────────────────────────────────────────

describe("toLocalIso", () => {
    it("formats a date without timezone drift", () => {
        const d = new Date(2026, 0, 5); // Jan 5 local
        expect(toLocalIso(d)).toBe("2026-01-05");
    });

    it("pads month and day", () => {
        expect(toLocalIso(new Date(2025, 8, 3))).toBe("2025-09-03"); // Sep 3
    });
});

// ─── getCampgroundOpenCount — no window ──────────────────────────────────────

describe("getCampgroundOpenCount — no window", () => {
    it("returns 0 for empty siteAvailability", () => {
        const c: ProcessedCampground = {
            id: "1",
            name: "Empty",
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {},
        };
        expect(getCampgroundOpenCount(c)).toBe(0);
    });

    it("counts all matches across all sites", () => {
        const c: ProcessedCampground = {
            id: "1",
            name: "Test",
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {
                s1: {
                    siteId: "s1",
                    siteName: "A",
                    dates: [],
                    matches: [
                        { from: "2026-07-01", to: "2026-07-04", nights: 3 },
                        { from: "2026-08-01", to: "2026-08-03", nights: 2 },
                    ],
                    excludedMatches: [],
                },
                s2: {
                    siteId: "s2",
                    siteName: "B",
                    dates: [],
                    matches: [{ from: "2026-07-10", to: "2026-07-12", nights: 2 }],
                    excludedMatches: [],
                },
            },
        };
        expect(getCampgroundOpenCount(c)).toBe(3);
    });

    it("handles undefined siteAvailability gracefully", () => {
        const c = {
            id: "1",
            name: "X",
            sites: { favorites: [], worthwhile: [] },
        } as unknown as ProcessedCampground;
        expect(getCampgroundOpenCount(c)).toBe(0);
    });
});

// ─── getCampgroundOpenCount — with window ────────────────────────────────────

describe("getCampgroundOpenCount — with window", () => {
    it("counts a match fully inside the window", () => {
        const c = makeCampground([{ from: "2026-07-10", to: "2026-07-12" }]);
        const winStart = new Date(2026, 6, 1); // Jul 1
        const winEnd = new Date(2026, 6, 31); // Jul 31
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(1);
    });

    it("excludes a match entirely before the window", () => {
        const c = makeCampground([{ from: "2026-06-01", to: "2026-06-05" }]);
        const winStart = new Date(2026, 6, 1);
        const winEnd = new Date(2026, 6, 31);
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(0);
    });

    it("excludes a match entirely after the window", () => {
        const c = makeCampground([{ from: "2026-08-01", to: "2026-08-05" }]);
        const winStart = new Date(2026, 6, 1);
        const winEnd = new Date(2026, 6, 31);
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(0);
    });

    it("counts a match that starts before and ends inside the window (overlap start)", () => {
        // from < winStart but to > winStart => overlaps
        const c = makeCampground([{ from: "2026-06-28", to: "2026-07-03" }]);
        const winStart = new Date(2026, 6, 1); // Jul 1
        const winEnd = new Date(2026, 6, 31);
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(1);
    });

    it("counts a match that starts inside and ends after the window (overlap end)", () => {
        // from <= winEnd and to > winStart => overlaps
        const c = makeCampground([{ from: "2026-07-29", to: "2026-08-03" }]);
        const winStart = new Date(2026, 6, 1);
        const winEnd = new Date(2026, 6, 31);
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(1);
    });

    it("off-by-one: match.to === winStart is excluded (to > winStart required)", () => {
        // to === winStart means checkout is the same day as window opens — does not overlap
        const winStart = new Date(2026, 6, 10); // Jul 10
        const winEnd = new Date(2026, 6, 20);
        const c = makeCampground([{ from: "2026-07-08", to: "2026-07-10" }]); // to == winStart
        // m.to "2026-07-10" > "2026-07-10" is false => excluded
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(0);
    });

    it("off-by-one: match.from === winEnd is included (from <= winEnd required)", () => {
        const winStart = new Date(2026, 6, 1);
        const winEnd = new Date(2026, 6, 20); // Jul 20
        const c = makeCampground([{ from: "2026-07-20", to: "2026-07-22" }]); // from == winEnd
        // m.from "2026-07-20" <= "2026-07-20" is true, m.to "2026-07-22" > "2026-07-01" is true => included
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(1);
    });

    it("returns 0 when no matches exist in the window", () => {
        const c = makeCampground([]);
        expect(getCampgroundOpenCount(c, new Date(2026, 6, 1), new Date(2026, 6, 31))).toBe(0);
    });

    it("sums matches across multiple sites within the window", () => {
        const c: ProcessedCampground = {
            id: "1",
            name: "Multi",
            sites: { favorites: [], worthwhile: [] },
            siteAvailability: {
                s1: {
                    siteId: "s1",
                    siteName: "A",
                    dates: [],
                    matches: [{ from: "2026-07-05", to: "2026-07-07", nights: 2 }],
                    excludedMatches: [],
                },
                s2: {
                    siteId: "s2",
                    siteName: "B",
                    dates: [],
                    matches: [
                        { from: "2026-07-12", to: "2026-07-14", nights: 2 },
                        { from: "2026-08-01", to: "2026-08-03", nights: 2 },
                    ],
                    excludedMatches: [],
                },
            },
        };
        const winStart = new Date(2026, 6, 1);
        const winEnd = new Date(2026, 6, 31);
        // s1: 1 match in window; s2: 1 in window + 1 outside = total 2
        expect(getCampgroundOpenCount(c, winStart, winEnd)).toBe(2);
    });
});
