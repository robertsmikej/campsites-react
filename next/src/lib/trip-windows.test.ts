import { describe, it, expect } from "vitest";
import {
    addDaysIso,
    diffDays,
    coreRange,
    windowIsPast,
    windowTargets,
    activeWindowsFor,
    isNightInWindow,
    siteMatchesWindow,
    maximalRunInWindow,
    openNightsBySiteFromRaw,
    tripHitsForCampground,
    validTripWindows,
    serverTodayIso,
    TRIP_MAX_WINDOWS,
    TRIP_MAX_NIGHTS,
} from "./trip-windows";
import type { TripWindow } from "@/types/campground";

const w = (over: Partial<TripWindow> = {}): TripWindow => ({
    id: "w1",
    from: "2026-07-30", // Thu arrival
    to: "2026-08-03", // Mon checkout (4 nights)
    ...over,
});

describe("date helpers", () => {
    it("addDaysIso crosses month boundaries without drift", () => {
        expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
        expect(addDaysIso("2026-08-01", -1)).toBe("2026-07-31");
    });
    it("diffDays counts whole days", () => {
        expect(diffDays("2026-07-30", "2026-08-03")).toBe(4);
    });
});

describe("serverTodayIso", () => {
    it("Saturday evening Pacific still counts as Saturday", () => {
        // 2026-07-26T01:00:00Z is 2026-07-25 6pm Pacific (UTC-7).
        expect(serverTodayIso(new Date("2026-07-26T01:00:00Z"))).toBe("2026-07-25");
    });
    it("rolls to the next day once the 8h grace has elapsed", () => {
        expect(serverTodayIso(new Date("2026-07-26T09:00:00Z"))).toBe("2026-07-26");
    });
});

describe("coreRange", () => {
    it("is the window itself with no flex", () => {
        expect(coreRange(w())).toEqual({ from: "2026-07-30", to: "2026-08-03" });
    });
    it("shrinks each end by flexDays", () => {
        expect(coreRange(w({ flexDays: 1 }))).toEqual({ from: "2026-07-31", to: "2026-08-02" });
    });
});

describe("window predicates", () => {
    it("windowIsPast once checkout day arrives", () => {
        expect(windowIsPast(w(), "2026-08-02")).toBe(false);
        expect(windowIsPast(w(), "2026-08-03")).toBe(true);
    });
    it("windowTargets: absent/empty means all", () => {
        expect(windowTargets(w(), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: [] }), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: ["123"] }), "123")).toBe(true);
        expect(windowTargets(w({ campgroundIds: ["999"] }), "123")).toBe(false);
    });
    it("activeWindowsFor filters past and non-targeting windows", () => {
        const wins = [w(), w({ id: "w2", from: "2026-06-01", to: "2026-06-03" })];
        expect(activeWindowsFor(wins, "123", "2026-07-22").map((x) => x.id)).toEqual(["w1"]);
    });
    it("isNightInWindow is half-open (checkout night excluded)", () => {
        expect(isNightInWindow("2026-07-30", w())).toBe(true);
        expect(isNightInWindow("2026-08-02", w())).toBe(true);
        expect(isNightInWindow("2026-08-03", w())).toBe(false);
    });
});

describe("matching", () => {
    const nights = (...days: string[]) => new Set(days);
    it("requires every core night with no flex", () => {
        const open = nights("2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02");
        expect(siteMatchesWindow(open, w())).toBe(true);
        open.delete("2026-08-01");
        expect(siteMatchesWindow(open, w())).toBe(false);
    });
    it("flex 1 accepts Fri->Mon, Thu->Sun, and Fri->Sun", () => {
        const win = w({ flexDays: 1 });
        expect(siteMatchesWindow(nights("2026-07-31", "2026-08-01"), win)).toBe(true); // Fri+Sat only
        expect(siteMatchesWindow(nights("2026-07-31"), win)).toBe(false); // missing Sat core night
    });
    it("maximalRunInWindow expands from the core to the window edges", () => {
        const win = w({ flexDays: 1 });
        const open = nights("2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02");
        expect(maximalRunInWindow(open, win)).toEqual({ from: "2026-07-30", to: "2026-08-03", nights: 4 });
        // Only the core open: run = core
        expect(maximalRunInWindow(nights("2026-07-31", "2026-08-01"), win)).toEqual({
            from: "2026-07-31",
            to: "2026-08-02",
            nights: 2,
        });
        expect(maximalRunInWindow(nights("2026-07-31"), win)).toBeNull();
    });
});

describe("openNightsBySiteFromRaw", () => {
    it("merges months, normalizes datetimes, skips ignored types and null slots", () => {
        const raw = [
            {
                campsites: {
                    "111": {
                        site: "A01",
                        campsite_type: "STANDARD NONELECTRIC",
                        availabilities: {
                            "2026-07-30T00:00:00Z": "Available",
                            "2026-07-31T00:00:00Z": "Reserved",
                        },
                    },
                    "222": { site: "GRP", campsite_type: "WALK TO", availabilities: {} },
                },
            },
            null,
            {
                campsites: {
                    "111": {
                        site: "A01",
                        campsite_type: "STANDARD NONELECTRIC",
                        availabilities: { "2026-08-01T00:00:00Z": "Available" },
                    },
                },
            },
        ];
        const by = openNightsBySiteFromRaw(raw);
        expect(by.has("222")).toBe(false);
        expect([...by.get("111")!.nights].sort()).toEqual(["2026-07-30", "2026-08-01"]);
        expect(by.get("111")!.siteName).toBe("A01");
    });
});

describe("tripHitsForCampground", () => {
    const cg = { id: "233563", name: "Point CG", sites: { favorites: ["A01"], worthwhile: ["B02"] } };
    const raw = [
        {
            campsites: {
                "111": {
                    site: "A01",
                    campsite_type: "STANDARD NONELECTRIC",
                    availabilities: {
                        "2026-07-31T00:00:00Z": "Available",
                        "2026-08-01T00:00:00Z": "Available",
                    },
                },
                "333": {
                    site: "C03",
                    campsite_type: "STANDARD NONELECTRIC",
                    availabilities: { "2026-07-31T00:00:00Z": "Available" },
                },
            },
        },
    ];
    it("returns hits with tier and maximal run; bypasses nothing it shouldn't", () => {
        const win = w({ from: "2026-07-31", to: "2026-08-02" }); // Fri->Sun, 2 nights
        const hits = tripHitsForCampground(raw, cg, [win], "2026-07-22");
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({
            windowId: "w1",
            campgroundId: "233563",
            campgroundName: "Point CG",
            siteId: "111",
            siteName: "A01",
            tier: "favorites",
            run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
        });
    });
    it("skips past windows and non-targeting windows", () => {
        const past = w({ from: "2026-07-01", to: "2026-07-03" });
        const elsewhere = w({ id: "w9", from: "2026-07-31", to: "2026-08-02", campgroundIds: ["999"] });
        expect(tripHitsForCampground(raw, cg, [past, elsewhere], "2026-07-22")).toEqual([]);
    });
});

describe("validTripWindows", () => {
    const valid = { id: "a", from: "2026-07-31", to: "2026-08-02" };
    it("accepts undefined and a valid list", () => {
        expect(validTripWindows(undefined)).toBe(true);
        expect(validTripWindows([valid])).toBe(true);
        expect(validTripWindows([{ ...valid, label: "x", flexDays: 0, campgroundIds: ["1"] }])).toBe(true);
    });
    it("rejects bad shapes", () => {
        expect(validTripWindows("nope")).toBe(false);
        expect(validTripWindows([{ ...valid, id: "" }])).toBe(false);
        expect(validTripWindows([{ ...valid, from: "2026-7-31" }])).toBe(false);
        expect(validTripWindows([{ ...valid, to: "2026-07-31" }])).toBe(false); // from >= to
        expect(validTripWindows([{ ...valid, label: "x".repeat(81) }])).toBe(false);
        expect(validTripWindows([{ ...valid, flexDays: 1 }])).toBe(false); // 2 nights <= 2*1
        expect(validTripWindows([{ ...valid, flexDays: 1.5 }])).toBe(false);
        expect(validTripWindows([{ ...valid, campgroundIds: [42] }])).toBe(false);
        expect(
            validTripWindows(
                Array.from({ length: TRIP_MAX_WINDOWS + 1 }, (_, i) => ({ ...valid, id: `w${i}` })),
            ),
        ).toBe(false);
    });
    it("caps span at TRIP_MAX_NIGHTS", () => {
        expect(
            validTripWindows([
                { id: "a", from: "2026-07-01", to: addDaysIso("2026-07-01", TRIP_MAX_NIGHTS) },
            ]),
        ).toBe(true);
        expect(
            validTripWindows([
                { id: "a", from: "2026-07-01", to: addDaysIso("2026-07-01", TRIP_MAX_NIGHTS + 1) },
            ]),
        ).toBe(false);
    });
    it("rejects a list with duplicate ids", () => {
        const a = { ...valid, id: "dup" };
        const b = { id: "dup", from: "2026-09-01", to: "2026-09-03" };
        expect(validTripWindows([a, b])).toBe(false);
    });
});
