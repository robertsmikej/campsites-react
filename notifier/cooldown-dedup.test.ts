import { describe, it, expect } from "vitest";
import { diffPerUser } from "./check";
import type { MatchResult } from "./lib/diff";

const COOLDOWN = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-06T18:35:00.000Z");
const CG = "232050";
const SITE = "15750"; // Glacier View site 016
const KEY = `${CG}:${SITE}`;

function m(from: string, to: string, nights: number, siteId = SITE): MatchResult {
    return {
        campgroundId: CG,
        campgroundName: "Glacier View",
        campgroundArea: "",
        campgroundDescription: "",
        siteId,
        siteName: siteId,
        match: { from, to, nights },
        group: "all-others",
    };
}
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 60 * 60 * 1000;

describe("diffPerUser — overlap-aware persistent dedup", () => {
    it("alerts a never-seen opening and records its range", () => {
        const { newMatches, nextState } = diffPerUser(
            [m("2026-06-13", "2026-06-18", 5)],
            null,
            NOW,
            COOLDOWN,
        );
        expect(newMatches).toHaveLength(1);
        expect(nextState.sites?.[KEY]).toEqual([{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW) }]);
    });

    it("suppresses an overlapping window next cycle (window shrank Jun13–18 -> Jun14–18)", () => {
        const prior = { sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - HOUR) }] } };
        const { newMatches, nextState } = diffPerUser(
            [m("2026-06-14", "2026-06-18", 4)],
            prior,
            NOW,
            COOLDOWN,
        );
        expect(newMatches).toHaveLength(0);
        // merged into one span, last-seen refreshed
        expect(nextState.sites?.[KEY]).toEqual([{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW) }]);
    });

    it("collapses multiple stay-lengths of one opening into a single alert in the same cycle", () => {
        const matches = [
            m("2026-06-13", "2026-06-18", 5),
            m("2026-06-14", "2026-06-18", 4),
            m("2026-06-13", "2026-06-17", 4),
        ];
        const { newMatches } = diffPerUser(matches, null, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
        expect(newMatches[0]!.match).toEqual({ from: "2026-06-13", to: "2026-06-18", nights: 5 });
    });

    it("still alerts a genuinely separate (non-overlapping) window at the same site", () => {
        const prior = { sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - HOUR) }] } };
        const { newMatches } = diffPerUser([m("2026-07-04", "2026-07-07", 3)], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
    });

    it("re-alerts an opening last seen longer ago than the cooldown", () => {
        const prior = {
            sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - 25 * HOUR) }] },
        };
        const { newMatches } = diffPerUser([m("2026-06-13", "2026-06-18", 5)], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
    });

    it("retains a disappeared opening within the cooldown (flicker stays suppressed)", () => {
        const prior = { sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - HOUR) }] } };
        const { newMatches, nextState } = diffPerUser([], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
        expect(nextState.sites?.[KEY]).toEqual([
            { from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - HOUR) },
        ]);
    });

    it("prunes a disappeared opening older than the cooldown", () => {
        const prior = {
            sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - 25 * HOUR) }] },
        };
        const { nextState } = diffPerUser([], prior, NOW, COOLDOWN);
        expect(nextState.sites?.[KEY]).toBeUndefined();
    });

    it("migrates legacy {signatures:[]} as seen-now (no deploy-time burst)", () => {
        const prior = { signatures: [`${CG}:${SITE}:2026-06-13:2026-06-18:5`] };
        const { newMatches } = diffPerUser([m("2026-06-14", "2026-06-18", 4)], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0); // overlaps the migrated range
    });

    it("migrates v1 {notified:{sig:iso}} as ranges", () => {
        const prior = { notified: { [`${CG}:${SITE}:2026-06-13:2026-06-18:5`]: iso(NOW - HOUR) } };
        const { newMatches } = diffPerUser([m("2026-06-14", "2026-06-18", 4)], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(0);
    });

    it("does not let one site's ranges suppress another site", () => {
        const prior = { sites: { [KEY]: [{ from: "2026-06-13", to: "2026-06-18", seen: iso(NOW - HOUR) }] } };
        const { newMatches } = diffPerUser([m("2026-06-13", "2026-06-18", 5, "99999")], prior, NOW, COOLDOWN);
        expect(newMatches).toHaveLength(1);
    });
});
