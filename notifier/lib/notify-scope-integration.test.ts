import { describe, it, expect } from "vitest";
import { findNewMatches, type CampgroundResult, type SiteConfigForDiff } from "./diff";
import { matchPassesScope, resolveNotifyScope } from "./notify-scope";
import type { SiteAvailabilityMap } from "../../next/src/lib/recgov/types";

// Mirrors how check.ts wires it: findNewMatches assigns each match a group from
// the campground's sites.favorites/worthwhile (by site NAME), then the scope
// filter (matchPassesScope) decides which groups actually get emailed.

function siteAvail(siteId: string, siteName: string): SiteAvailabilityMap[string] {
    return {
        siteId,
        siteName,
        dates: [],
        matches: [{ from: "2026-07-04", to: "2026-07-06", nights: 2 }],
        excludedMatches: [],
    };
}

const results: CampgroundResult[] = [
    {
        campgroundId: "232358",
        campgroundName: "Outlet",
        campgroundArea: "",
        campgroundDescription: "",
        sites: {
            a: siteAvail("a", "001"), // tagged favorite
            b: siteAvail("b", "002"), // tagged worthwhile
            c: siteAvail("c", "003"), // untagged (other)
        },
    },
];

const configs: SiteConfigForDiff[] = [
    { id: "232358", sites: { favorites: ["001"], worthwhile: ["002"] }, notifyAll: false },
];

describe("notify scope — tags drive what gets emailed", () => {
    const all = findNewMatches(results, new Set(), configs);
    const emailedSitesFor = (scope: "favorites" | "worthwhile" | "all") =>
        all
            .filter((m) => matchPassesScope(m.group, scope))
            .map((m) => m.siteName)
            .sort();

    it("assigns each match a group from sites.favorites/worthwhile by site name", () => {
        expect(all.find((m) => m.siteName === "001")!.group).toBe("favorites");
        expect(all.find((m) => m.siteName === "002")!.group).toBe("worthwhile");
        expect(all.find((m) => m.siteName === "003")!.group).toBe("all-others");
    });

    it("favorites only → emails ONLY favorite-tagged sites", () => {
        expect(emailedSitesFor("favorites")).toEqual(["001"]);
    });

    it("favorites + worthwhile → emails favorites and worthwhile, not others", () => {
        expect(emailedSitesFor("worthwhile")).toEqual(["001", "002"]);
    });

    it("any site opens → emails every site", () => {
        expect(emailedSitesFor("all")).toEqual(["001", "002", "003"]);
    });

    it("a favorites-only campground with no favorites tagged emails nothing", () => {
        const noFavs = findNewMatches(results, new Set(), [
            { id: "232358", sites: { favorites: [], worthwhile: ["002"] }, notifyAll: false },
        ]);
        expect(noFavs.filter((m) => matchPassesScope(m.group, "favorites"))).toHaveLength(0);
    });
});

describe("resolveNotifyScope precedence", () => {
    it("uses the campground's explicit scope first", () => {
        expect(resolveNotifyScope({ notifyScope: "favorites", notifyAll: true }, "all")).toBe("favorites");
    });
    it("falls back legacy notifyAll → user default → favorites", () => {
        expect(resolveNotifyScope({ notifyAll: true }, undefined)).toBe("all");
        expect(resolveNotifyScope({}, "worthwhile")).toBe("worthwhile");
        expect(resolveNotifyScope({}, undefined)).toBe("favorites");
    });
});
