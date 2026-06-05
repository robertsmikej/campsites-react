import { describe, it, expect } from "vitest";
import { formatEmail } from "./email";
import type { MatchResult } from "./diff";

function match(over: Partial<MatchResult>): MatchResult {
    return {
        campgroundId: "234007",
        campgroundName: "Outlet Campground",
        campgroundArea: "Redfish Lake",
        campgroundDescription: "",
        siteId: "1",
        siteName: "011",
        match: { from: "2026-07-10", to: "2026-07-12", nights: 2 },
        group: "all-others",
        ...over,
    } as MatchResult;
}

// The preheader uses lowercase "site"; the visible opening card uses "Site" — so
// "Outlet site 011" uniquely targets the preview text.
describe("formatEmail preheader", () => {
    it("leads with a favorite + site number when a favorite opened", () => {
        const { html } = formatEmail([
            match({ group: "all-others", siteName: "003" }),
            match({ group: "favorites", siteName: "011" }),
            match({ group: "all-others", siteName: "008" }),
        ]);
        expect(html).toContain("★ Outlet site 011");
        expect(html).toContain("more opening");
    });

    it("names a site even when nothing is a favorite", () => {
        const { html } = formatEmail([match({ group: "all-others", siteName: "003" })]);
        expect(html).toContain("Outlet site 003");
    });

    it("still renders the favorite badge on the opening card", () => {
        const { html } = formatEmail([match({ group: "favorites", siteName: "011" })]);
        expect(html).toContain("Favorite site"); // regression: email already calls out favorites
    });
});
