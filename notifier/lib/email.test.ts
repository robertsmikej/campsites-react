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

// The preheader (notification preview) leads with the favorite, site, arrival
// day, and nights, then "+N more". The full string only appears in the hidden
// preheader, so it uniquely targets the preview text.
describe("formatEmail preheader", () => {
    it("leads with a favorite, its dates, and a count of the rest", () => {
        const { html } = formatEmail([
            match({ group: "all-others", siteName: "003" }),
            match({ group: "favorites", siteName: "011" }),
            match({ group: "all-others", siteName: "008" }),
        ]);
        // from 2026-07-10 = Fri Jul 10, 2 nights; two other openings.
        expect(html).toContain("★ Site 011 · Fri Jul 10 · 2 nights +2 more openings");
    });

    it("names a site and its dates even when nothing is a favorite", () => {
        const { html } = formatEmail([match({ group: "all-others", siteName: "003" })]);
        expect(html).toContain("Site 003 · Fri Jul 10 · 2 nights");
        expect(html).not.toContain("more opening"); // single opening
    });

    it("includes the campground when several campgrounds are mixed", () => {
        const { html } = formatEmail([
            match({ campgroundName: "Outlet Campground", siteName: "011", group: "favorites" }),
            match({ campgroundName: "Glacier Campground", siteName: "022", group: "all-others" }),
        ]);
        expect(html).toContain("★ Outlet 011 · Fri Jul 10 · 2 nights +1 more opening");
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

describe("formatSpottedLine defensive guard", () => {
    it("returns empty string for a malformed timestamp", () => {
        expect(formatSpottedLine("garbage", Date.now())).toBe("");
    });
});

describe("adjacent openings section", () => {
    it("renders an Adjacent openings section and leads the subject", () => {
        const groups = [
            {
                campgroundId: "cg1",
                siteIds: ["012", "013"],
                siteNames: ["012", "013"],
                from: "2026-06-19",
                to: "2026-06-21",
                nights: 2,
                anchorTier: "none" as const,
            },
        ];
        const { subject, html } = formatEmail([], {
            adjacentGroups: groups,
            campgroundNamesById: { cg1: "Glacier View" },
        });
        expect(subject).toMatch(/adjacent/i);
        expect(html).toMatch(/Adjacent openings/i);
        expect(html).toMatch(/012/);
        expect(html).toContain("Glacier View");
    });

    it("renders both group and per-site sections when both are present", () => {
        const groups = [
            {
                campgroundId: "234007",
                siteIds: ["011", "012"],
                siteNames: ["011", "012"],
                from: "2026-07-10",
                to: "2026-07-12",
                nights: 2,
                anchorTier: "favorites" as const,
            },
        ];
        const { html } = formatEmail([match({ siteName: "003" })], {
            adjacentGroups: groups,
            campgroundNamesById: { "234007": "Outlet Campground" },
        });
        expect(html).toMatch(/Adjacent openings/i);
        expect(html).toContain("Site 003"); // per-site block still renders below
    });
});

describe("opening-card cap", () => {
    const manyMatches = (n: number): MatchResult[] =>
        Array.from({ length: n }, (_, i) =>
            match({ siteId: String(i + 1), siteName: `Q${i + 1}`, group: "all-others" }),
        );

    it("caps the cards and links the remainder to the dashboard", () => {
        const { html } = formatEmail(manyMatches(13), { siteUrl: "https://campwatch.dev" });
        expect(html).toContain("+ 3 more openings not shown here");
        expect(html).toContain("See them all on your dashboard");
        expect(html).toContain("of 13"); // eyebrow keeps the true total
        // sites past the cap (the 11th onward) are not rendered as cards
        expect(html).not.toContain(">Site Q11<");
        expect(html).not.toContain(">Site Q13<");
    });

    it("renders no 'more' row when the batch fits under the cap", () => {
        const { html } = formatEmail(manyMatches(4), { siteUrl: "https://campwatch.dev" });
        expect(html).not.toContain("not shown here");
    });
});
