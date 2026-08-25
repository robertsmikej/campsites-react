import { describe, it, expect } from "vitest";
import { groupCampgrounds } from "./campground-groups";
import type { Campground } from "@/types/campground";

function cg(overrides: Partial<Campground> & { id: string; name: string }): Campground {
    return {
        sites: { favorites: [], worthwhile: [] },
        ...overrides,
    };
}

describe("groupCampgrounds", () => {
    it("puts ungrouped campgrounds in the default bucket", () => {
        const result = groupCampgrounds([cg({ id: "1", name: "A" }), cg({ id: "2", name: "B" })]);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe("");
        expect(result[0]!.campgrounds).toHaveLength(2);
    });

    it("groups campgrounds by their group field", () => {
        const result = groupCampgrounds([
            cg({ id: "1", name: "Summer A", group: "Summer" }),
            cg({ id: "2", name: "Winter A", group: "Winter Cabins" }),
            cg({ id: "3", name: "Summer B", group: "Summer" }),
        ]);
        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe("Summer");
        expect(result[0]!.campgrounds.map((c) => c.id)).toEqual(["1", "3"]);
        expect(result[1]!.name).toBe("Winter Cabins");
        expect(result[1]!.campgrounds.map((c) => c.id)).toEqual(["2"]);
    });

    it("places named groups before the default (ungrouped) bucket", () => {
        const result = groupCampgrounds([
            cg({ id: "1", name: "Winter A", group: "Winter" }),
            cg({ id: "2", name: "No Group" }),
            cg({ id: "3", name: "Winter B", group: "Winter" }),
        ]);
        expect(result).toHaveLength(2);
        expect(result[0]!.name).toBe("Winter");
        expect(result[0]!.campgrounds.map((c) => c.id)).toEqual(["1", "3"]);
        expect(result[1]!.name).toBe("");
        expect(result[1]!.campgrounds.map((c) => c.id)).toEqual(["2"]);
    });

    it("preserves campground order within each group", () => {
        const result = groupCampgrounds([
            cg({ id: "3", name: "C", group: "G" }),
            cg({ id: "1", name: "A", group: "G" }),
            cg({ id: "2", name: "B", group: "G" }),
        ]);
        expect(result[0]!.campgrounds.map((c) => c.id)).toEqual(["3", "1", "2"]);
    });

    it("trims whitespace from group names", () => {
        const result = groupCampgrounds([
            cg({ id: "1", name: "A", group: " Winter " }),
            cg({ id: "2", name: "B", group: "Winter" }),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe("Winter");
    });

    it("treats empty-string group the same as absent", () => {
        const result = groupCampgrounds([cg({ id: "1", name: "A", group: "" }), cg({ id: "2", name: "B" })]);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe("");
        expect(result[0]!.campgrounds).toHaveLength(2);
    });

    it("derives the date range from the union of campground dates", () => {
        const result = groupCampgrounds([
            cg({
                id: "1",
                name: "A",
                group: "Summer",
                dates: { startDate: "2026-06-15", endDate: "2026-09-15" },
            }),
            cg({
                id: "2",
                name: "B",
                group: "Summer",
                dates: { startDate: "2026-06-01", endDate: "2026-09-30" },
            }),
        ]);
        expect(result[0]!.dateRange).toEqual({ start: "2026-06-01", end: "2026-09-30" });
    });

    it("returns null dateRange when no campground has dates", () => {
        const result = groupCampgrounds([cg({ id: "1", name: "A" })]);
        expect(result[0]!.dateRange).toBeNull();
    });

    it("handles a mix of dated and undated campgrounds in one group", () => {
        const result = groupCampgrounds([
            cg({ id: "1", name: "A", dates: { startDate: "2026-07-01", endDate: "2026-08-31" } }),
            cg({ id: "2", name: "B" }),
        ]);
        expect(result[0]!.dateRange).toEqual({ start: "2026-07-01", end: "2026-08-31" });
    });

    it("returns an empty array for empty input", () => {
        expect(groupCampgrounds([])).toEqual([]);
    });

    it("preserves named-group insertion order before the default bucket", () => {
        const result = groupCampgrounds([
            cg({ id: "1", name: "A", group: "Zebra" }),
            cg({ id: "2", name: "B", group: "Alpha" }),
            cg({ id: "3", name: "C" }),
        ]);
        expect(result.map((g) => g.name)).toEqual(["Zebra", "Alpha", ""]);
    });
});
