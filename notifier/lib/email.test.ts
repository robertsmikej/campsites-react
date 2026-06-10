import { describe, it, expect } from "vitest";
import { formatSpottedLine, formatEmail } from "./email";
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

// 2026-06-10T20:14:00Z = 2:14 PM Mountain Daylight Time (UTC-6)
const FIRST_SEEN = "2026-06-10T20:14:00.000Z";

describe("formatSpottedLine", () => {
    it("renders under-a-minute freshness", () => {
        const now = new Date(FIRST_SEEN).getTime() + 40_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe(
            "Spotted 2:14 PM MT · under a minute before this email",
        );
    });

    it("renders minutes", () => {
        const now = new Date(FIRST_SEEN).getTime() + 12 * 60_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe("Spotted 2:14 PM MT · 12 min before this email");
    });

    it("renders hours and minutes", () => {
        const now = new Date(FIRST_SEEN).getTime() + (3 * 60 + 20) * 60_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe("Spotted 2:14 PM MT · 3 hr 20 min before this email");
    });

    it("renders days and hours with the date included", () => {
        const now = new Date(FIRST_SEEN).getTime() + (2 * 24 + 5) * 3_600_000;
        expect(formatSpottedLine(FIRST_SEEN, now)).toBe(
            "Spotted Jun 10, 2:14 PM MT · 2 days 5 hr before this email",
        );
    });
});

describe("opening card spotted line", () => {
    const baseMatch: MatchResult = {
        campgroundId: "232358",
        campgroundName: "Outlet",
        campgroundArea: "Stanley",
        campgroundDescription: "",
        siteId: "1",
        siteName: "Site 001",
        match: { from: "2026-07-04", to: "2026-07-06", nights: 2 },
        group: "favorites",
    };

    // formatEmail real signature: (newMatches: MatchResult[], options?: FormatEmailOptions)
    // options: { unsubscribeUrl?, email?, apiSecret?, siteUrl? }
    function render(m: MatchResult): string {
        const { html } = formatEmail([m], { siteUrl: "https://campwatch.dev" });
        return html;
    }

    it("includes the spotted line when firstSeenAt is set", () => {
        const html = render({ ...baseMatch, firstSeenAt: FIRST_SEEN });
        expect(html).toContain("Spotted");
        expect(html).toContain("2:14 PM MT");
    });

    it("omits the line when firstSeenAt is absent", () => {
        const html = render(baseMatch);
        expect(html).not.toContain("Spotted");
    });
});
