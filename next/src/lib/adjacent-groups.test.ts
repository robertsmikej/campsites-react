import { describe, it, expect } from "vitest";
import { buildAdjacencyEdges, type AdjacencySite } from "./adjacent-groups";

// ~10m of latitude ≈ 0.00009 deg; ~50m ≈ 0.00045 deg; ~80m ≈ 0.00072 deg.
const at = (id: string, latOffset: number, loop?: string): AdjacencySite => ({
    id,
    lat: 44.1 + latOffset,
    lng: -114.9,
    loop,
});

describe("buildAdjacencyEdges — geo", () => {
    it("links a site to its nearest neighbor within the cap", () => {
        const edges = buildAdjacencyEdges([at("A", 0), at("B", 0.00045)]); // ~50m
        expect(edges.get("A")?.has("B")).toBe(true);
        expect(edges.get("B")?.has("A")).toBe(true);
    });

    it("does not link sites beyond the 60m cap", () => {
        const edges = buildAdjacencyEdges([at("A", 0), at("B", 0.0009)]); // ~100m
        expect(edges.get("A")?.size ?? 0).toBe(0);
    });

    it("links only the 2 nearest neighbors, not a farther in-cap site", () => {
        // A at 0; B,C,D at ~20,~40,~55m — all within cap, but only the 2 nearest are kept.
        const edges = buildAdjacencyEdges([
            at("A", 0),
            at("B", 0.00018),
            at("C", 0.00036),
            at("D", 0.0005),
        ]);
        expect(edges.get("A")?.has("B")).toBe(true);
        expect(edges.get("A")?.has("C")).toBe(true);
        // D is A's 3rd-nearest, so A does not originate an edge to D; but D may still
        // be linked symmetrically if A is among D's 2 nearest — assert A->D absent only
        // when D has 2 closer neighbors than A. Here C and B are closer to D than A, so:
        expect(edges.get("A")?.has("D")).toBe(false);
    });

    it("does not link across different loops", () => {
        const edges = buildAdjacencyEdges([at("A", 0, "Loop1"), at("B", 0.00045, "Loop2")]);
        expect(edges.get("A")?.size ?? 0).toBe(0);
    });

    it("links within the same loop", () => {
        const edges = buildAdjacencyEdges([at("A", 0, "Loop1"), at("B", 0.00045, "Loop1")]);
        expect(edges.get("A")?.has("B")).toBe(true);
    });
});

describe("buildAdjacencyEdges — number fallback", () => {
    const noCoord = (id: string, loop?: string): AdjacencySite => ({ id, lat: null, lng: null, loop });

    it("links consecutive site numbers when coords are missing", () => {
        const edges = buildAdjacencyEdges([noCoord("012"), noCoord("013")]);
        expect(edges.get("012")?.has("013")).toBe(true);
    });

    it("does not link non-consecutive numbers", () => {
        const edges = buildAdjacencyEdges([noCoord("012"), noCoord("015")]);
        expect(edges.get("012")?.size ?? 0).toBe(0);
    });

    it("ignores ids with no parseable integer", () => {
        const edges = buildAdjacencyEdges([noCoord("Group Site"), noCoord("Cabin")]);
        expect(edges.get("Group Site")?.size ?? 0).toBe(0);
    });

    it("does not link consecutive numbers across loops", () => {
        const edges = buildAdjacencyEdges([noCoord("012", "L1"), noCoord("013", "L2")]);
        expect(edges.get("012")?.size ?? 0).toBe(0);
    });

    it("uses number fallback when only one site has coords", () => {
        const edges = buildAdjacencyEdges([
            { id: "012", lat: 44.1, lng: -114.9 },
            { id: "013", lat: null, lng: null },
        ]);
        expect(edges.get("012")?.has("013")).toBe(true);
    });
});

import { findAdjacentGroups, type AdjacentGroupInput } from "./adjacent-groups";

const baseSettings = { stayLengths: [2], validStartDays: ["Friday", "Saturday"], blackoutDates: [] };

// Helper: build availability of consecutive nights starting at a given Fri.
const nights = (...days: string[]) => days;

function input(over: Partial<AdjacentGroupInput>): AdjacentGroupInput {
    return {
        campgroundId: "cg1",
        sites: [],
        availableNightsByName: {},
        tiers: { favorites: [], worthwhile: [] },
        settings: baseSettings,
        anchorScope: "all",
        ...over,
    };
}

describe("findAdjacentGroups", () => {
    // 2026-06-19 is a Friday; nights 06-19 & 06-20 form a 2-night Fri stay (to=06-21).
    const fri = "2026-06-19";
    const sat = "2026-06-20";
    const checkout = "2026-06-21";

    it("emits a group when two adjacent sites share a bookable window", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ siteIds: ["012", "013"], from: fri, to: checkout, nights: 2 });
    });

    it("does not emit when the shared window is too short for the stay length", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(sat) }, // only Sat overlaps
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not emit for non-adjacent sites even if both open", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "020", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "020": nights(fri, sat) },
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not bridge a closed middle site (A-B-C chain, B closed)", () => {
        const groups = findAdjacentGroups(input({
            sites: [
                { id: "012", lat: null, lng: null },
                { id: "013", lat: null, lng: null },
                { id: "014", lat: null, lng: null },
            ],
            availableNightsByName: { "012": nights(fri, sat), "014": nights(fri, sat) }, // 013 closed
        }));
        expect(groups).toHaveLength(0);
    });

    it("emits a 3-site group when the whole chain is open", () => {
        const groups = findAdjacentGroups(input({
            sites: [
                { id: "012", lat: null, lng: null },
                { id: "013", lat: null, lng: null },
                { id: "014", lat: null, lng: null },
            ],
            availableNightsByName: {
                "012": nights(fri, sat), "013": nights(fri, sat), "014": nights(fri, sat),
            },
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]?.siteIds).toEqual(["012", "013", "014"]);
    });

    it("rejects a group with no favorite when anchorScope is favorites", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            anchorScope: "favorites",
        }));
        expect(groups).toHaveLength(0);
    });

    it("accepts and tags a group containing a favorite when anchorScope is favorites", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            tiers: { favorites: ["013"], worthwhile: [] },
            anchorScope: "favorites",
        }));
        expect(groups).toHaveLength(1);
        expect(groups[0]?.anchorTier).toBe("favorites");
    });

    it("excludes windows overlapping a blackout range", () => {
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(fri, sat), "013": nights(fri, sat) },
            settings: { ...baseSettings, blackoutDates: [{ from: fri, to: sat }] },
        }));
        expect(groups).toHaveLength(0);
    });

    it("does not emit for a window starting on a disallowed day", () => {
        const sun = "2026-06-21";
        const mon = "2026-06-22";
        const groups = findAdjacentGroups(input({
            sites: [{ id: "012", lat: null, lng: null }, { id: "013", lat: null, lng: null }],
            availableNightsByName: { "012": nights(sun, mon), "013": nights(sun, mon) },
        }));
        expect(groups).toHaveLength(0); // Sunday start not in validStartDays
    });
});
