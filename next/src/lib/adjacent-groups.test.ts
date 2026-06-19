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
