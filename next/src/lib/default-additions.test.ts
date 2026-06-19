import { describe, it, expect } from "vitest";
import { recentlyAddedFromDefault } from "./default-additions";
import type { Campground } from "@/types/campground";

function cg(id: string, addedAt?: string): Campground {
    return {
        id,
        name: `CG ${id}`,
        sites: { favorites: [], worthwhile: [] },
        ...(addedAt ? { addedAt } : {}),
    };
}

describe("recentlyAddedFromDefault", () => {
    it("returns a default added after seenAt that is not on the user's list", () => {
        const defaults = [cg("1", "2026-06-10T00:00:00.000Z")];
        const result = recentlyAddedFromDefault(defaults, [], "2026-06-01T00:00:00.000Z");
        expect(result.map((c) => c.id)).toEqual(["1"]);
    });

    it("excludes defaults with no addedAt (pre-existing curator picks)", () => {
        const defaults = [cg("1"), cg("2", "2026-06-10T00:00:00.000Z")];
        const result = recentlyAddedFromDefault(defaults, [], "2026-06-01T00:00:00.000Z");
        expect(result.map((c) => c.id)).toEqual(["2"]);
    });

    it("excludes defaults added at or before seenAt", () => {
        const defaults = [
            cg("1", "2026-05-01T00:00:00.000Z"), // before
            cg("2", "2026-06-01T00:00:00.000Z"), // exactly seenAt
            cg("3", "2026-06-10T00:00:00.000Z"), // after
        ];
        const result = recentlyAddedFromDefault(defaults, [], "2026-06-01T00:00:00.000Z");
        expect(result.map((c) => c.id)).toEqual(["3"]);
    });

    it("excludes defaults already on the user's list even when newer than seenAt", () => {
        const defaults = [cg("1", "2026-06-10T00:00:00.000Z"), cg("2", "2026-06-10T00:00:00.000Z")];
        const userList = [cg("1")];
        const result = recentlyAddedFromDefault(defaults, userList, "2026-06-01T00:00:00.000Z");
        expect(result.map((c) => c.id)).toEqual(["2"]);
    });

    it("treats a missing seenAt as epoch (all addedAt defaults are new)", () => {
        const defaults = [cg("1"), cg("2", "2026-06-10T00:00:00.000Z")];
        expect(recentlyAddedFromDefault(defaults, [], undefined).map((c) => c.id)).toEqual(["2"]);
        expect(recentlyAddedFromDefault(defaults, [], null).map((c) => c.id)).toEqual(["2"]);
    });

    it("preserves default list order", () => {
        const defaults = [
            cg("3", "2026-06-12T00:00:00.000Z"),
            cg("1", "2026-06-10T00:00:00.000Z"),
            cg("2", "2026-06-11T00:00:00.000Z"),
        ];
        const result = recentlyAddedFromDefault(defaults, [], "2026-06-01T00:00:00.000Z");
        expect(result.map((c) => c.id)).toEqual(["3", "1", "2"]);
    });

    it("returns an empty array for an empty default list", () => {
        expect(recentlyAddedFromDefault([], [], "2026-06-01T00:00:00.000Z")).toEqual([]);
    });
});
