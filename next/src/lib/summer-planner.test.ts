import { describe, it, expect } from "vitest";
import { summerWindow, monthWindow, pickSummerYear, buildCandidates, planSummer } from "./summer-planner";
import type { BlackoutRange, ProcessedCampground, SiteAvailability } from "@/types/campground";

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
function cg(id: string, name: string, favorites: string[], sites: SiteAvailability[]): ProcessedCampground {
    return {
        id,
        name,
        area: `${name} area`,
        sites: { favorites, worthwhile: [] },
        siteAvailability: Object.fromEntries(sites.map((s) => [s.siteId, s])),
    } as unknown as ProcessedCampground;
}

describe("summerWindow", () => {
    it("is Jun 1 – Sep 30 of the given year", () => {
        const w = summerWindow(2026);
        expect(w.start.getFullYear()).toBe(2026);
        expect(w.start.getMonth()).toBe(5); // June
        expect(w.start.getDate()).toBe(1);
        expect(w.end.getMonth()).toBe(8); // September
        expect(w.end.getDate()).toBe(30);
    });
});

describe("monthWindow", () => {
    it("spans first day of startMonth to last day of endMonth", () => {
        const w = monthWindow(2027, 4, 8); // May–Sep 2027
        expect(w.start.getMonth()).toBe(4); // May
        expect(w.start.getDate()).toBe(1);
        expect(w.end.getMonth()).toBe(8); // Sep
        expect(w.end.getDate()).toBe(30);
    });
    it("handles end months with 31 days", () => {
        const w = monthWindow(2027, 4, 9); // May–Oct
        expect(w.end.getMonth()).toBe(9); // Oct
        expect(w.end.getDate()).toBe(31);
    });
});

describe("pickSummerYear", () => {
    it("chooses the year with the most Jun–Sep openings, else now's year", () => {
        const camps = [
            cg("1", "A", [], [site("a", [["2026-07-04", "2026-07-06"]])]),
            cg("2", "B", [], [site("b", [["2026-08-01", "2026-08-03"]])]),
            cg("3", "C", [], [site("c", [["2027-07-01", "2027-07-03"]])]),
        ];
        expect(pickSummerYear(camps, new Date(2026, 0, 1))).toBe(2026);
        expect(pickSummerYear([], new Date(2030, 0, 1))).toBe(2030);
    });
});

describe("buildCandidates", () => {
    it("emits one candidate per match whose arrival is in the window, tagged tier + weekend", () => {
        const camps = [
            cg(
                "1",
                "Outlet",
                ["001"],
                [
                    site("001", [["2026-07-03", "2026-07-05"]]), // Fri Jul 3 -> includes weekend, fav
                    site("002", [["2026-05-20", "2026-05-22"]]), // before window -> excluded
                ],
            ),
        ];
        const cands = buildCandidates(camps, summerWindow(2026));
        expect(cands).toHaveLength(1);
        expect(cands[0]).toMatchObject({
            campgroundId: "1",
            campgroundName: "Outlet",
            siteName: "001",
            tier: "fav",
            from: "2026-07-03",
            to: "2026-07-05",
            nights: 2,
            includesWeekend: true,
        });
    });
});

describe("planSummer", () => {
    const W = summerWindow(2026);
    const camps = [
        cg("1", "June CG", ["a"], [site("a", [["2026-06-12", "2026-06-14"]])]), // Fri Jun 12 weekend
        cg("2", "July CG", ["b"], [site("b", [["2026-07-15", "2026-07-17"]])]),
        cg("3", "Aug CG", ["c"], [site("c", [["2026-08-14", "2026-08-16"]])]), // Fri Aug 14 weekend
        cg("4", "Sep CG", ["d"], [site("d", [["2026-09-04", "2026-09-06"]])]), // Fri Sep 4 weekend
        cg("5", "Extra CG", ["e"], [site("e", [["2026-07-20", "2026-07-22"]])]),
    ];

    it("returns up to targetTrips at distinct campgrounds, sorted by date", () => {
        const plan = planSummer(camps, { window: W, targetTrips: 5 });
        expect(plan.trips.length).toBeGreaterThanOrEqual(4);
        const ids = plan.trips.map((t) => t.campgroundId);
        expect(new Set(ids).size).toBe(ids.length);
        const froms = plan.trips.map((t) => t.from);
        expect(froms).toEqual([...froms].sort());
        expect(plan.stats.campgroundCount).toBe(plan.trips.length);
    });

    it("each trip carries a date-deep-linked book url and stable id", () => {
        const plan = planSummer(camps, { window: W, targetTrips: 5 });
        const t = plan.trips[0]!;
        expect(t.id).toBe(`${t.campgroundId}:${t.siteId}:${t.from}:${t.to}`);
        expect(t.bookUrl).toContain(`/camping/campsites/${t.siteId}`);
        expect(t.bookUrl).toContain(`arrivalDate=${t.from}`);
        expect(t.bookUrl).toContain(`departureDate=${t.to}`);
    });

    it("prefers favorites and weekends when a slot has multiple options", () => {
        const competing = [
            cg("10", "Weekday Other", [], [site("x", [["2026-07-07", "2026-07-09"]])]), // Tue, other
            cg("11", "Weekend Fav", ["y"], [site("y", [["2026-07-10", "2026-07-12"]])]), // Fri, fav
        ];
        const plan = planSummer(competing, { window: W, targetTrips: 1 });
        expect(plan.trips[0]!.campgroundId).toBe("11");
    });

    it("returns fewer trips with a note when openings are scarce", () => {
        const sparse = [cg("1", "Only One", ["a"], [site("a", [["2026-07-15", "2026-07-17"]])])];
        const plan = planSummer(sparse, { window: W, targetTrips: 5 });
        expect(plan.trips).toHaveLength(1);
        expect(plan.notes.length).toBeGreaterThan(0);
    });

    it("keeps a locked trip fixed and re-plans the rest", () => {
        const plan1 = planSummer(camps, { window: W, targetTrips: 5 });
        const lockId = plan1.trips[1]!.id;
        const plan2 = planSummer(camps, { window: W, targetTrips: 5, lockedTripIds: [lockId] });
        expect(plan2.trips.some((t) => t.id === lockId && t.locked)).toBe(true);
    });

    it("favoritesOnly drops non-favorite candidates", () => {
        const mixed = [
            cg("30", "Fav CG", ["f"], [site("f", [["2026-07-10", "2026-07-12"]])]),
            cg("31", "Other CG", [], [site("o", [["2026-08-10", "2026-08-12"]])]),
        ];
        const plan = planSummer(mixed, { window: W, targetTrips: 5, favoritesOnly: true });
        expect(plan.trips.every((t) => t.tier === "fav")).toBe(true);
        expect(plan.trips.some((t) => t.campgroundId === "31")).toBe(false);
    });

    it("weekendOnly drops trips without a Fri/Sat night", () => {
        const mixed = [
            cg("40", "Weekend", ["a"], [site("a", [["2026-07-10", "2026-07-12"]])]), // Fri Jul 10
            cg("41", "Weekday", ["b"], [site("b", [["2026-07-07", "2026-07-09"]])]), // Tue Jul 7
        ];
        const plan = planSummer(mixed, { window: W, targetTrips: 5, weekendOnly: true });
        expect(plan.trips.every((t) => t.includesWeekend)).toBe(true);
        expect(plan.trips.some((t) => t.campgroundId === "41")).toBe(false);
    });

    it("excludeTripIds avoids re-picking when an alternative exists", () => {
        const twoInJuly = [
            cg("20", "First", ["a"], [site("a", [["2026-07-10", "2026-07-12"]])]),
            cg("21", "Second", ["b"], [site("b", [["2026-07-11", "2026-07-13"]])]),
        ];
        const first = planSummer(twoInJuly, { window: W, targetTrips: 1 });
        const firstId = first.trips[0]!.id;
        const second = planSummer(twoInJuly, { window: W, targetTrips: 1, excludeTripIds: [firstId] });
        expect(second.trips[0]!.id).not.toBe(firstId);
    });

    it("excludes candidate trips overlapping a blackout", () => {
        // CG "11" has a trip 2026-07-10→2026-07-12; night of Jul 10 is blacked out.
        // CG "10" has a trip 2026-07-07→2026-07-09; no overlap — should still appear.
        const mixed = [
            cg("10", "Weekday Other", [], [site("x", [["2026-07-07", "2026-07-09"]])]),
            cg("11", "Weekend Fav", ["y"], [site("y", [["2026-07-10", "2026-07-12"]])]),
        ];
        const blackoutDates: BlackoutRange[] = [{ from: "2026-07-10", to: "2026-07-10" }];
        const plan = planSummer(mixed, { window: W, targetTrips: 5, blackoutDates });
        const keys = plan.trips.map((t) => `${t.from}|${t.to}`);
        expect(keys).not.toContain("2026-07-10|2026-07-12");
        expect(keys).toContain("2026-07-07|2026-07-09");
    });

    it("without blackoutDates the plan is unchanged", () => {
        const mixed = [
            cg("10", "Weekday Other", [], [site("x", [["2026-07-07", "2026-07-09"]])]),
            cg("11", "Weekend Fav", ["y"], [site("y", [["2026-07-10", "2026-07-12"]])]),
        ];
        const base = planSummer(mixed, { window: W, targetTrips: 5 });
        const withEmpty = planSummer(mixed, { window: W, targetTrips: 5, blackoutDates: [] });
        expect(withEmpty.trips.map((t) => t.id)).toEqual(base.trips.map((t) => t.id));
    });
});
