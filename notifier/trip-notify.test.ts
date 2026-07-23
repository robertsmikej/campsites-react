import { describe, it, expect } from "vitest";
import { diffTripsWithCooldown, suppressTripDuplicates, buildTripDigests } from "./check";
import type { TripSiteHit } from "../next/src/lib/trip-windows";
import type { TripWindow } from "../next/src/types/campground";
import type { MatchResult } from "./lib/diff";

const NOW = Date.parse("2026-07-22T18:00:00Z");
const HOURS = 60 * 60 * 1000;

const hit = (over: Partial<TripSiteHit> = {}): TripSiteHit => ({
    windowId: "w1",
    campgroundId: "233563",
    campgroundName: "Point Campground",
    siteId: "111",
    siteName: "A01",
    tier: "favorites",
    run: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    ...over,
});

const win: TripWindow = { id: "w1", from: "2026-07-31", to: "2026-08-02", label: "Lake weekend" };

describe("diffTripsWithCooldown", () => {
    it("first sighting fires and is recorded", () => {
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], null, NOW);
        expect(newHits).toHaveLength(1);
        expect(nextTripState["w1:233563:111"]).toHaveLength(1);
    });

    it("an overlapping run within the cooldown does not re-fire", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 2 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits, nextTripState } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(0);
        // The prior seen is PRESERVED (not refreshed), so it can age out and re-fire.
        expect(nextTripState["w1:233563:111"]![0]!.seen).toBe(new Date(NOW - 2 * HOURS).toISOString());
    });

    it("re-fires once the prior range ages past the 6h cooldown", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 7 * HOURS).toISOString() },
                ],
            },
        };
        const { newHits } = diffTripsWithCooldown([hit()], prior, NOW);
        expect(newHits).toHaveLength(1);
    });

    it("keys are independent per window and site", () => {
        const prior = {
            trips: {
                "w1:233563:111": [
                    { from: "2026-07-31", to: "2026-08-02", seen: new Date(NOW - 1 * HOURS).toISOString() },
                ],
            },
        };
        const other = hit({ siteId: "222", siteName: "B02" });
        const { newHits } = diffTripsWithCooldown([hit(), other], prior, NOW);
        expect(newHits.map((h) => h.siteId)).toEqual(["222"]);
    });
});

describe("suppressTripDuplicates", () => {
    const match = {
        campgroundId: "233563",
        campgroundName: "Point Campground",
        campgroundArea: "",
        campgroundDescription: "",
        siteId: "111",
        siteName: "A01",
        group: "favorites",
        match: { from: "2026-07-31", to: "2026-08-02", nights: 2 },
    } as MatchResult;
    it("drops normal matches covered by a trip hit this run", () => {
        expect(suppressTripDuplicates([match], [hit()])).toEqual([]);
    });
    it("keeps non-overlapping matches", () => {
        const sept = { ...match, match: { from: "2026-09-04", to: "2026-09-06", nights: 2 } } as never;
        expect(suppressTripDuplicates([sept], [hit()])).toHaveLength(1);
    });
});

describe("buildTripDigests", () => {
    it("one digest per window, favorites first, capped body, sole-hit deep link", () => {
        const digests = buildTripDigests([hit()], [win], "https://campwatch.dev");
        expect(digests).toHaveLength(1);
        expect(digests[0]!.push.title).toBe("Trip match: Lake weekend");
        expect(digests[0]!.push.tag).toBe("cw-trip-w1");
        expect(digests[0]!.push.url).toContain("/camping/campsites/111?");
        expect(digests[0]!.push.body).toContain("★ Point Campground · A01");
    });
    it("multi-campground digest links to the dashboard", () => {
        const hits = [
            hit(),
            hit({
                campgroundId: "999",
                campgroundName: "Other",
                siteId: "9",
                siteName: "Z9",
                tier: "all-others",
            }),
        ];
        const digests = buildTripDigests(hits, [win], "https://campwatch.dev");
        expect(digests[0]!.push.url).toBe("https://campwatch.dev/app");
    });
    it("returns nothing for windows with no hits", () => {
        expect(buildTripDigests([], [win], "")).toEqual([]);
    });
});
