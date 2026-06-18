import { describe, it, expect, vi } from "vitest";
import {
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
});

describe("buildNotifyPlan", () => {
    it("includes every enabled campground regardless of tier or minute", () => {
        const t = [target([cg("H", "high"), cg("N", "normal"), cg("L", "low")])];
        expect(ids(buildNotifyPlan(t, NOW_MONTH))).toEqual(["H", "L", "N"]);
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
