import { describe, it, expect } from "vitest";
import { mergeNotifierSites, COOLDOWN_MS } from "./notifier-state-merge";

const NOW = Date.parse("2026-06-18T13:20:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;
const recent = iso(NOW - HOUR);

describe("mergeNotifierSites", () => {
    it("retains a site present only in existing (the overlapping-cron clobber case)", () => {
        // A stale run recomputed state without Bull Trout (232431) because it
        // didn't re-fetch it this cycle. Merging must NOT erase Bull Trout.
        const existing = {
            "232431:18649": [{ from: "2026-07-16", to: "2026-07-19", seen: recent }],
            "232085:53676": [{ from: "2026-06-22", to: "2026-06-28", seen: recent }],
        };
        const incoming = {
            "232085:53676": [{ from: "2026-06-22", to: "2026-06-28", seen: iso(NOW) }],
        };
        const merged = mergeNotifierSites(existing, incoming, NOW);
        expect(merged["232431:18649"]).toEqual([{ from: "2026-07-16", to: "2026-07-19", seen: recent }]);
        // refreshed seen on the site both sides have
        expect(merged["232085:53676"]).toEqual([{ from: "2026-06-22", to: "2026-06-28", seen: iso(NOW) }]);
    });

    it("retains a site present only in incoming", () => {
        const merged = mergeNotifierSites(
            {},
            { "232431:18649": [{ from: "2026-07-16", to: "2026-07-19", seen: iso(NOW) }] },
            NOW,
        );
        expect(merged["232431:18649"]).toHaveLength(1);
    });

    it("unions overlapping windows into one span keeping the latest seen", () => {
        const existing = { K: [{ from: "2026-07-16", to: "2026-07-19", seen: recent }] };
        const incoming = { K: [{ from: "2026-07-17", to: "2026-07-22", seen: iso(NOW) }] };
        const merged = mergeNotifierSites(existing, incoming, NOW);
        expect(merged.K).toEqual([{ from: "2026-07-16", to: "2026-07-22", seen: iso(NOW) }]);
    });

    it("keeps genuinely separate (non-overlapping) windows distinct", () => {
        const existing = { K: [{ from: "2026-07-16", to: "2026-07-19", seen: recent }] };
        const incoming = { K: [{ from: "2026-08-01", to: "2026-08-03", seen: iso(NOW) }] };
        const merged = mergeNotifierSites(existing, incoming, NOW);
        expect(merged.K).toHaveLength(2);
    });

    it("drops ranges aged past the cooldown and prunes the key when all age out", () => {
        const stale = iso(NOW - COOLDOWN_MS - HOUR);
        const merged = mergeNotifierSites(
            { K: [{ from: "2026-01-01", to: "2026-01-03", seen: stale }] },
            {},
            NOW,
        );
        expect(merged.K).toBeUndefined();
    });

    it("ignores malformed ranges without throwing", () => {
        const existing = {
            K: [
                { from: "2026-07-16", to: "2026-07-19", seen: recent },
                { from: "x", to: "y", seen: "not-a-date" } as never,
            ],
        };
        const merged = mergeNotifierSites(existing, {}, NOW);
        expect(merged.K).toEqual([{ from: "2026-07-16", to: "2026-07-19", seen: recent }]);
    });

    it("returns an empty object for two empty inputs", () => {
        expect(mergeNotifierSites(undefined, undefined, NOW)).toEqual({});
    });
});
