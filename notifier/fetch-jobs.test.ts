import { describe, it, expect, vi } from "vitest";
import {
    bookingHorizonMonth,
    buildFastLanePlan,
    buildSweepPlan,
    buildNotifyPlan,
    readCachedMonths,
    fetchToCache,
} from "./fetch-jobs";
import type { KvAdapter } from "../next/src/lib/recgov/cache";

vi.mock("../next/src/lib/recgov/fetch-month", () => ({
    fetchMonth: vi.fn(async (id: string, month: string) =>
        id === "FAIL" ? null : { campsites: { [`${id}-${month}`]: {} } },
    ),
}));

function cg(id: string, checkPriority?: "high" | "normal" | "low", enabled = true) {
    return {
        id,
        name: id,
        enabled,
        ...(checkPriority ? { checkPriority } : {}),
        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
        sites: { favorites: [], worthwhile: [] },
    };
}
function target(cgs: ReturnType<typeof cg>[]) {
    return { campgrounds: { "recreation.gov": cgs } };
}
const NOW_MONTH = "2026-07";
const ids = (plan: { campgroundId: string }[]) => [...new Set(plan.map((p) => p.campgroundId))].sort();

describe("buildFastLanePlan", () => {
    it("includes only high-tier campgrounds", () => {
        const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low"), cg("D", "normal")])];
        expect(ids(buildFastLanePlan(t, NOW_MONTH))).toEqual(["H"]);
    });
    it("excludes disabled campgrounds", () => {
        const t = [target([cg("H", "high", false)])];
        expect(buildFastLanePlan(t, NOW_MONTH)).toEqual([]);
    });
});

describe("buildSweepPlan", () => {
    const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low")])];
    it("includes normal but not low on a %5 (not %10) minute", () => {
        expect(ids(buildSweepPlan(t, 5, NOW_MONTH))).toEqual(["N"]);
    });
    it("includes both normal and low on a %10 minute", () => {
        expect(ids(buildSweepPlan(t, 10, NOW_MONTH))).toEqual(["L", "N"]);
    });
    it("never includes high-tier", () => {
        expect(ids(buildSweepPlan(t, 0, NOW_MONTH))).toEqual(["L", "N"]);
    });
    it("treats a missing checkPriority as normal", () => {
        const t2 = [target([cg("X")])];
        expect(ids(buildSweepPlan(t2, 5, NOW_MONTH))).toEqual(["X"]);
    });
    it("excludes disabled campgrounds", () => {
        const t2 = [target([cg("ON", "normal"), cg("OFF", "normal", false)])];
        expect(ids(buildSweepPlan(t2, 5, NOW_MONTH))).toEqual(["ON"]);
    });
});

describe("buildNotifyPlan", () => {
    it("includes every enabled campground regardless of tier or minute", () => {
        const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low")])];
        expect(ids(buildNotifyPlan(t, NOW_MONTH))).toEqual(["H", "L", "N"]);
    });
    it("excludes disabled campgrounds", () => {
        const t = [target([cg("ON", "normal"), cg("OFF", "high", false), cg("OFF2", "low", false)])];
        expect(ids(buildNotifyPlan(t, NOW_MONTH))).toEqual(["ON"]);
    });
    it("drops fully-past months but keeps the now-month", () => {
        const t = [
            target([{ ...cg("A", "low"), dates: { startDate: "2026-05-01", endDate: "2026-07-31" } }]),
        ];
        const months = buildNotifyPlan(t, "2026-07").map((p) => p.month);
        expect(months).toEqual(["2026-07"]);
    });
});

function kvWith(raw: Record<string, unknown>): KvAdapter {
    return {
        getRaw: async (id: string, month: string) => (raw[`${id}:${month}`] ?? null) as never,
        putRaw: async () => {},
        getSnapshot: async () => null,
        putSnapshot: async () => {},
        deleteSnapshot: async () => {},
    };
}

describe("readCachedMonths", () => {
    it("returns cached values per campground in plan order, null on miss", async () => {
        const kv = kvWith({
            "A:2026-07": { campsites: { "1": {} } },
            // A:2026-08 is a miss
            "B:2026-07": { campsites: {} },
        });
        const plan = [
            { campgroundId: "A", month: "2026-07" },
            { campgroundId: "A", month: "2026-08" },
            { campgroundId: "B", month: "2026-07" },
        ];
        const out = await readCachedMonths(plan, kv);
        expect(out.A).toEqual([{ campsites: { "1": {} } }, null]);
        expect(out.B).toEqual([{ campsites: {} }]);
    });

    it("returns an empty object for an empty plan", async () => {
        expect(await readCachedMonths([], kvWith({}))).toEqual({});
    });
});

describe("fetchToCache", () => {
    it("writes fetched months to the cache and skips writes for failed fetches", async () => {
        const putRaw = vi.fn(async () => {});
        const kv: KvAdapter = {
            getRaw: async () => null,
            putRaw,
            getSnapshot: async () => null,
            putSnapshot: async () => {},
            deleteSnapshot: async () => {},
        };
        await fetchToCache(
            [
                { campgroundId: "A", month: "2026-07" },
                { campgroundId: "FAIL", month: "2026-07" },
            ],
            kv,
            { concurrency: 1, delayMs: 0 },
        );
        expect(putRaw).toHaveBeenCalledWith("A", "2026-07", { campsites: { "A-2026-07": {} } });
        expect(putRaw).not.toHaveBeenCalledWith("FAIL", "2026-07", expect.anything());
    });
});

describe("trip-window months", () => {
    const TODAY = "2026-07-22";
    const NOW_MONTH = "2026-07";
    const cg = (over: Record<string, unknown> = {}) => ({
        id: "233563",
        name: "Point",
        sites: { favorites: [], worthwhile: [] },
        dates: { startDate: "2026-07-01", endDate: "2026-07-31" },
        enabled: true,
        ...over,
    });
    const target = (campground: unknown, tripWindows?: unknown[]) =>
        ({
            campgrounds: { "recreation.gov": [campground] },
            ...(tripWindows ? { tripWindows } : {}),
        }) as never;

    it("notify plan unions trip-window months beyond the watch dates", () => {
        const t = target(cg(), [{ id: "w1", from: "2026-09-04", to: "2026-09-07" }]);
        const months = buildNotifyPlan([t], NOW_MONTH, TODAY)
            .map((p) => p.month)
            .sort();
        expect(months).toEqual(["2026-07", "2026-09"]);
    });

    it("covers a campground with no watch dates via its trip window", () => {
        const t = target(cg({ dates: undefined }), [{ id: "w1", from: "2026-08-07", to: "2026-08-09" }]);
        expect(buildNotifyPlan([t], NOW_MONTH, TODAY)).toEqual([
            { campgroundId: "233563", month: "2026-08" },
        ]);
    });

    it("a disabled campground stays out even with an active window", () => {
        // The whole point of the toggle is zero rec.gov calls. A trip window is
        // the one thing that can pull in months the watch dates don't cover, so
        // it's the path most likely to leak a fetch past the disabled guard.
        const t = target(cg({ enabled: false }), [{ id: "w1", from: "2026-09-04", to: "2026-09-07" }]);
        expect(buildNotifyPlan([t], NOW_MONTH, TODAY)).toEqual([]);
        expect(buildSweepPlan([t], 10, NOW_MONTH, TODAY)).toEqual([]);
    });

    it("fast lane never promotes an out-of-tier campground, window or not", () => {
        // Trip windows must not raise a campground's configured check cadence:
        // a normal-tier campground stays out of the 1-minute fast lane even
        // with a window starting in days.
        const soon = [{ id: "w1", from: "2026-07-31", to: "2026-08-02" }];
        expect(buildFastLanePlan([target(cg(), soon)], NOW_MONTH, TODAY)).toEqual([]);
        // A high-tier campground's trip months ride its own (1-minute) lane.
        const months = buildFastLanePlan([target(cg({ checkPriority: "high" }), soon)], NOW_MONTH, TODAY)
            .map((p) => p.month)
            .sort();
        expect(months).toEqual(["2026-07", "2026-08"]);
    });

    it("sweep fetches a normal-tier campground's trip months at its own cadence", () => {
        const soon = [{ id: "w1", from: "2026-07-31", to: "2026-08-02" }];
        const months = buildSweepPlan([target(cg(), soon)], 5, NOW_MONTH, TODAY)
            .map((p) => p.month)
            .sort();
        expect(months).toEqual(["2026-07", "2026-08"]);
    });

    it("window checkout on the 1st does not drag in the extra month", () => {
        const t = target(cg({ dates: undefined }), [{ id: "w1", from: "2026-08-28", to: "2026-09-01" }]);
        const months = buildNotifyPlan([t], NOW_MONTH, TODAY)
            .map((p) => p.month)
            .sort();
        expect(months).toEqual(["2026-08"]);
    });

    it("omitting todayIso keeps legacy behavior", () => {
        const t = target(cg(), [{ id: "w1", from: "2026-09-04", to: "2026-09-07" }]);
        expect(buildNotifyPlan([t], NOW_MONTH).map((p) => p.month)).toEqual(["2026-07"]);
    });
});

describe("bookingHorizonMonth", () => {
    it("returns 6 months + 1 day ahead", () => {
        // Sept 1 + 6 months = Mar 1 + 1 day = Mar 2 → "2027-03"
        expect(bookingHorizonMonth("2026-09-01")).toBe("2027-03");
    });

    it("buffer day pushes into the next month when needed", () => {
        // Aug 31 + 6 months → Feb 28 (non-leap) would overflow to Mar 3 in JS,
        // + 1 day = Mar 4. Either way the month is "2027-03", which is the
        // correct conservative result.
        const result = bookingHorizonMonth("2026-08-31");
        expect(result).toBe("2027-03");
    });

    it("mid-month date stays in the expected month", () => {
        // July 15 + 6 months = Jan 15 + 1 day = Jan 16 → "2027-01"
        expect(bookingHorizonMonth("2026-07-15")).toBe("2027-01");
    });

    it("year boundary works correctly", () => {
        // Dec 1 + 6 months = Jun 1 + 1 day = Jun 2 → "2027-06"
        expect(bookingHorizonMonth("2026-12-01")).toBe("2027-06");
    });
});

describe("booking horizon filtering", () => {
    // A campground spanning well past the 6-month booking window.
    const farOut = (id: string, checkPriority?: "high" | "normal" | "low") => ({
        id,
        name: id,
        enabled: true,
        ...(checkPriority ? { checkPriority } : {}),
        dates: { startDate: "2026-07-01", endDate: "2027-06-30" },
        sites: { favorites: [], worthwhile: [] },
    });
    const farTarget = (cgs: ReturnType<typeof farOut>[]) => ({
        campgrounds: { "recreation.gov": cgs },
    });

    it("clips watch-date months to the booking horizon", () => {
        // Today is 2026-09-01, horizon is 2027-03. Months from Jul 2026
        // through Jun 2027 are in the date range, but only Sep 2026 through
        // Mar 2027 should survive (past months dropped, beyond-horizon dropped).
        const t = [farTarget([farOut("A")])];
        const months = buildNotifyPlan(t, "2026-09", "2026-09-01")
            .map((p) => p.month)
            .sort();
        expect(months).toEqual([
            "2026-09",
            "2026-10",
            "2026-11",
            "2026-12",
            "2027-01",
            "2027-02",
            "2027-03",
        ]);
    });

    it("clips trip-window months to the booking horizon", () => {
        // A trip window 8 months out should be clipped.
        const cg = farOut("A");
        cg.dates = { startDate: "2026-09-01", endDate: "2026-09-30" };
        const t = {
            campgrounds: { "recreation.gov": [cg] },
            tripWindows: [
                { id: "w1", from: "2027-05-01", to: "2027-05-04", campgroundIds: ["A"] },
            ],
        } as never;
        const months = buildNotifyPlan([t], "2026-09", "2026-09-01")
            .map((p) => p.month)
            .sort();
        // 2027-05 is past the horizon (2027-03), so only the watch month survives.
        expect(months).toEqual(["2026-09"]);
    });

    it("without todayIso, no horizon is applied (backward compat)", () => {
        const t = [farTarget([farOut("A")])];
        const months = buildNotifyPlan(t, "2026-09")
            .map((p) => p.month)
            .sort();
        // All months from Sep 2026 through Jun 2027 (no horizon clipping).
        expect(months).toEqual([
            "2026-09",
            "2026-10",
            "2026-11",
            "2026-12",
            "2027-01",
            "2027-02",
            "2027-03",
            "2027-04",
            "2027-05",
            "2027-06",
        ]);
    });

    it("horizon applies consistently across fast-lane and sweep plans", () => {
        const t = [farTarget([farOut("H", "high"), farOut("N", "normal")])];
        const fastMonths = buildFastLanePlan(t, "2026-09", "2026-09-01")
            .map((p) => p.month)
            .sort();
        const sweepMonths = buildSweepPlan(t, 5, "2026-09", "2026-09-01")
            .map((p) => p.month)
            .sort();
        const expected = [
            "2026-09", "2026-10", "2026-11", "2026-12",
            "2027-01", "2027-02", "2027-03",
        ];
        expect(fastMonths).toEqual(expected);
        expect(sweepMonths).toEqual(expected);
    });
});
