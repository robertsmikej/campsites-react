import { describe, it, expect } from "vitest";
import { diffPerUser } from "./check";
import type { MatchResult } from "./lib/diff";

const COOLDOWN = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-06T12:00:00.000Z");

function m(cg: string, siteId: string, from: string, to: string, nights: number): MatchResult {
    return {
        campgroundId: cg,
        campgroundName: cg,
        campgroundArea: "",
        campgroundDescription: "",
        siteId,
        siteName: siteId,
        match: { from, to, nights },
        group: "all-others",
    };
}
function sig(x: MatchResult): string {
    return `${x.campgroundId}:${x.siteId}:${x.match.from}:${x.match.to}:${x.match.nights}`;
}
const iso = (ms: number) => new Date(ms).toISOString();

describe("diffPerUser — persistent cooldown dedup", () => {
    const opening = m("232358", "69803", "2026-06-13", "2026-06-15", 2);
    const S = sig(opening);

    it("alerts an opening never seen before and stamps it", () => {
        const { newMatches, nextState } = diffPerUser([opening], null, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
        expect(nextState.notified?.[S]).toBe(iso(NOW));
    });

    it("suppresses the same opening on the next cycle within the cooldown", () => {
        const prior = { notified: { [S]: iso(NOW - 60 * 60 * 1000) } }; // seen 1h ago
        const { newMatches, nextState } = diffPerUser([opening], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
        expect(nextState.notified?.[S]).toBe(iso(NOW)); // refreshed last-seen
    });

    it("does NOT re-alert a continuously-open opening even past 24h (last-seen keeps refreshing)", () => {
        // Simulate it having been refreshed recently; even if the original alert was >24h ago,
        // last-seen is recent because it's been visible every cycle.
        const prior = { notified: { [S]: iso(NOW - 60 * 60 * 1000) } };
        const { newMatches } = diffPerUser([opening], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
    });

    it("re-alerts when last seen longer ago than the cooldown (genuinely freed up again)", () => {
        const prior = { notified: { [S]: iso(NOW - 25 * 60 * 60 * 1000) } }; // 25h ago
        const { newMatches } = diffPerUser([opening], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
    });

    it("retains a disappeared opening within the cooldown so a flicker stays suppressed", () => {
        const prior = { notified: { [S]: iso(NOW - 60 * 60 * 1000) } };
        // opening not present this cycle (booked)
        const { newMatches, nextState } = diffPerUser([], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
        expect(nextState.notified?.[S]).toBe(iso(NOW - 60 * 60 * 1000)); // retained, not refreshed
    });

    it("prunes a disappeared opening once it's older than the cooldown", () => {
        const prior = { notified: { [S]: iso(NOW - 25 * 60 * 60 * 1000) } };
        const { nextState } = diffPerUser([], prior, NOW, COOLDOWN);
        expect(nextState.notified?.[S]).toBeUndefined();
    });

    it("migrates the legacy {signatures:[]} shape as seen-now (no deploy-time re-alert burst)", () => {
        const prior = { signatures: [S] };
        const { newMatches, nextState } = diffPerUser([opening], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
        expect(nextState.notified?.[S]).toBe(iso(NOW));
    });
});
