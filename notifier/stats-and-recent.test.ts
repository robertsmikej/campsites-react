import { describe, it, expect } from "vitest";
import { computeStatsBody, maintainRecentOpeningsLog, type RecentOpening } from "./check";

const NOW = new Date("2026-06-24T12:00:00Z");
const NOW_MS = NOW.getTime();

describe("computeStatsBody", () => {
    it("returns zeros for an empty cycle with no prior stats", () => {
        const body = computeStatsBody({
            priorStats: null,
            sentLatenciesMs: [],
            campgroundsTracked: 0,
            now: NOW,
        });
        expect(body.medianLatencyMs).toBe(0);
        expect(body.sampleSize).toBe(0);
        expect(body.openingsSentToday).toBe(0);
        expect(body.openingsSentLast7Days).toBe(0);
        expect(body.todayKey).toBe("2026-06-24");
        expect(body.lastPollAt).toBe("2026-06-24T12:00:00.000Z");
    });

    it("computes an odd-length median", () => {
        const body = computeStatsBody({
            priorStats: null,
            sentLatenciesMs: [30, 10, 20],
            campgroundsTracked: 3,
            now: NOW,
        });
        expect(body.medianLatencyMs).toBe(20);
        expect(body.sampleSize).toBe(3);
        expect(body.openingsSentToday).toBe(3);
        expect(body.campgroundsTracked).toBe(3);
    });

    it("rounds an even-length median", () => {
        const body = computeStatsBody({
            priorStats: null,
            sentLatenciesMs: [10, 20, 30, 40],
            campgroundsTracked: 0,
            now: NOW,
        });
        expect(body.medianLatencyMs).toBe(25);
    });

    it("resets the daily counter and latency window when the day rolls over", () => {
        const priorStats = {
            todayKey: "2026-06-23",
            openingsSentToday: 9,
            _latencyWindow: [500, 600],
            _dailyHistory: [{ date: "2026-06-23", count: 9 }],
        };
        const body = computeStatsBody({
            priorStats,
            sentLatenciesMs: [10, 20],
            campgroundsTracked: 1,
            now: NOW,
        });
        expect(body.openingsSentToday).toBe(2); // reset, not 9 + 2
        expect(body.medianLatencyMs).toBe(15); // prior window dropped → [10, 20]
        expect(body.openingsSentLast7Days).toBe(11); // yesterday (9) still in window + today (2)
    });

    it("accumulates the daily counter and latency window within the same day", () => {
        const priorStats = {
            todayKey: "2026-06-24",
            openingsSentToday: 5,
            _latencyWindow: [100],
            _dailyHistory: [{ date: "2026-06-24", count: 5 }],
        };
        const body = computeStatsBody({
            priorStats,
            sentLatenciesMs: [200],
            campgroundsTracked: 2,
            now: NOW,
        });
        expect(body.openingsSentToday).toBe(6); // 5 + 1
        expect(body.medianLatencyMs).toBe(150); // [100, 200]
    });

    it("drops daily-history entries older than 7 days from the rolling sum", () => {
        const priorStats = {
            todayKey: "2026-06-24",
            openingsSentToday: 0,
            _dailyHistory: [
                { date: "2026-06-10", count: 100 }, // >7 days back → dropped
                { date: "2026-06-20", count: 4 }, // within 7 days → kept
            ],
        };
        const body = computeStatsBody({ priorStats, sentLatenciesMs: [], campgroundsTracked: 0, now: NOW });
        expect(body.openingsSentLast7Days).toBe(4);
    });

    it("caps the latency window at 200 samples, keeping the most recent", () => {
        const prior = Array.from({ length: 200 }, (_, i) => i + 1); // 1..200
        const priorStats = { todayKey: "2026-06-24", _latencyWindow: prior };
        const body = computeStatsBody({
            priorStats,
            sentLatenciesMs: [1000, 1001, 1002, 1003, 1004],
            campgroundsTracked: 0,
            now: NOW,
        });
        expect(body._latencyWindow.length).toBe(200);
        expect(body._latencyWindow[0]).toBe(6); // first 5 of 1..200 dropped
        expect(body._latencyWindow.at(-1)).toBe(1004);
    });
});

describe("maintainRecentOpeningsLog", () => {
    const enrich = (id: string): Omit<RecentOpening, "signature" | "detectedAt"> => ({
        campgroundId: "232358",
        campgroundName: "Outlet",
        siteId: id,
        siteName: `Site ${id}`,
        from: "2026-07-01",
        to: "2026-07-03",
        nights: 2,
    });

    it("prunes stale entries, adds fresh enriched signatures, and de-dupes", () => {
        const priorRecent: RecentOpening[] = [
            { signature: "old", ...enrich("1"), detectedAt: "2026-06-22T00:00:00Z" }, // >24h → pruned
            { signature: "keep", ...enrich("2"), detectedAt: "2026-06-24T06:00:00Z" }, // <24h → kept
        ];
        const newFirstSeenMap = {
            keep: "2026-06-24T06:00:00Z", // already logged → not re-added
            fresh: "2026-06-24T11:00:00Z", // within window + enriched → added
            stale: "2026-06-22T00:00:00Z", // older than window → skipped
            noenrich: "2026-06-24T11:30:00Z", // within window but no enrichment → skipped
        };
        const globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">> = {
            keep: enrich("2"),
            fresh: enrich("3"),
            stale: enrich("9"),
        };

        const { trimmedRecent, newThisCycle } = maintainRecentOpeningsLog({
            priorRecent,
            newFirstSeenMap,
            globalMatchesBySig,
            nowMs: NOW_MS,
        });

        const sigs = trimmedRecent.map((r) => r.signature);
        expect(newThisCycle).toBe(1); // only "fresh"
        expect(sigs).toContain("keep");
        expect(sigs).toContain("fresh");
        expect(sigs).not.toContain("old");
        expect(sigs).not.toContain("stale");
        expect(sigs).not.toContain("noenrich");
        expect(sigs[0]).toBe("fresh"); // newest-first (11:00 before 06:00)
    });

    it("caps the log at 200 entries, newest first", () => {
        const newFirstSeenMap: Record<string, string> = {};
        const globalMatchesBySig: Record<string, Omit<RecentOpening, "signature" | "detectedAt">> = {};
        for (let i = 0; i < 250; i++) {
            const sig = `s${String(i).padStart(3, "0")}`;
            newFirstSeenMap[sig] = new Date(NOW_MS - i * 60_000).toISOString(); // i minutes ago
            globalMatchesBySig[sig] = enrich(String(i));
        }

        const { trimmedRecent } = maintainRecentOpeningsLog({
            priorRecent: [],
            newFirstSeenMap,
            globalMatchesBySig,
            nowMs: NOW_MS,
        });

        expect(trimmedRecent.length).toBe(200);
        expect(trimmedRecent[0]!.signature).toBe("s000"); // most recent
    });
});
