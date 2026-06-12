import { it, expect } from "vitest";
import { mergeMapSites } from "./map-sites";
import type { SiteDetail } from "./site-details";

const details: SiteDetail[] = [
    {
        id: "002",
        campsiteId: "1",
        lat: 44.1,
        lng: -114.9,
        type: "tent",
        rating: 4,
        reviews: 2,
        cell: 3,
        shade: "full",
        amenities: {},
    },
    {
        id: "014",
        campsiteId: "2",
        lat: 44.2,
        lng: -114.8,
        type: "rv",
        rating: null,
        reviews: 0,
        cell: null,
        amenities: {},
    },
    {
        id: "020",
        campsiteId: "3",
        lat: null,
        lng: null,
        type: "other",
        rating: null,
        reviews: 0,
        cell: null,
        amenities: {},
    },
];

// availability keyed by siteId, each carries siteName + a count of open windows
const availability = {
    s1: {
        siteId: "s1",
        siteName: "002",
        matches: [{ from: "2026-07-04", to: "2026-07-06", nights: 2 }],
    },
    s2: { siteId: "s2", siteName: "014", matches: [] },
};

it("merges open state + favorite tier by site name", () => {
    const merged = mergeMapSites(details, availability as never, {
        favorites: ["014"],
        worthwhile: ["002"],
    });
    const byId = Object.fromEntries(merged.map((m) => [m.id, m]));
    expect(byId["002"]!.open).toBe(true);
    expect(byId["002"]!.openCount).toBe(1);
    expect(byId["002"]!.tier).toBe("worth");
    expect(byId["014"]!.open).toBe(false);
    expect(byId["014"]!.tier).toBe("fav");
    expect(byId["020"]!.tier).toBe("other");
    expect(byId["020"]!.open).toBe(false);
});

it("keeps a detail row even with no availability entry", () => {
    const merged = mergeMapSites(details, {} as never, {
        favorites: [],
        worthwhile: [],
    });
    expect(merged).toHaveLength(3);
    expect(merged.every((m) => m.open === false && m.openCount === 0)).toBe(true);
});
