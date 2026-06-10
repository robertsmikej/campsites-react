import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AvailabilityTimeline } from "./availability-timeline";
import SiteSettingsContext from "@/context/site-settings";
import type { ProcessedCampground, SiteAvailability, BlackoutRange } from "@/types/campground";
import type { SiteSettingsValue } from "@/context/site-settings";

function site(name: string, matches: Array<[string, string]>): SiteAvailability {
    return {
        siteId: `id-${name}`,
        siteName: name,
        dates: [],
        excludedMatches: [],
        matches: matches.map(([from, to]) => ({
            from,
            to,
            nights: Math.round((+new Date(to) - +new Date(from)) / 86400000),
        })),
    };
}

const DATE_RANGE = { start: new Date(2026, 4, 1), end: new Date(2026, 8, 30) };

const ROWS: ProcessedCampground[] = [
    {
        id: "1",
        name: "Outlet",
        area: "Redfish Lake",
        sites: { favorites: ["A-07", "Z-99"], worthwhile: ["B-23"] },
        totalSitesCount: 4,
        siteAvailability: {
            "A-07": site("A-07", [["2026-05-23", "2026-05-25"]]),
            "B-23": site("B-23", [["2026-06-11", "2026-06-14"]]),
        },
    } as unknown as ProcessedCampground,
    {
        id: "2",
        name: "Glacier View",
        area: "Glacier NP",
        sites: { favorites: [], worthwhile: [] },
        totalSitesCount: 1,
        siteAvailability: {
            "G-02": site("G-02", [["2026-07-04", "2026-07-07"]]),
        },
    } as unknown as ProcessedCampground,
];

describe("AvailabilityTimeline", () => {
    it("renders one row per campground and expands the first by default", () => {
        render(<AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} defaultExpandFirst />);
        expect(screen.getByText("Outlet")).toBeTruthy();
        expect(screen.getByText("Glacier View")).toBeTruthy();
        // First campground expanded -> its site rows are visible.
        expect(screen.getByText("Site A-07")).toBeTruthy();
        // Second campground collapsed -> its site row is not yet rendered.
        expect(screen.queryByText("Site G-02")).toBeNull();
    });

    it("expands and collapses a campground on click", () => {
        render(<AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} />);
        expect(screen.queryByText("Site A-07")).toBeNull();
        fireEvent.click(screen.getByText("Outlet"));
        expect(screen.getByText("Site A-07")).toBeTruthy();
        fireEvent.click(screen.getByText("Outlet"));
        expect(screen.queryByText("Site A-07")).toBeNull();
    });

    it("rings a favorite site's open block and marks tagged-but-booked sites", () => {
        render(<AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} defaultExpandFirst />);
        // A-07 is a favorite with an opening (May 23–24): its open block carries a clay ring.
        const blocks = screen.getAllByTitle(/May 23/);
        expect(blocks.some((b) => b.getAttribute("style")?.includes("--cw-clay"))).toBe(true);
        // Z-99 is a favorite with no availability -> synthesized "booked all season".
        expect(screen.getByText("Site Z-99")).toBeTruthy();
        expect(screen.getAllByText("booked all season").length).toBeGreaterThan(0);
    });

    it("reveals a site's date ranges with a recreation.gov link when the site is clicked", () => {
        render(<AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} defaultExpandFirst />);
        // Windows are hidden until the site row is clicked.
        expect(screen.queryByRole("link", { name: /book/i })).toBeNull();
        fireEvent.click(screen.getByText("Site A-07"));
        const link = screen.getByRole("link", { name: /book/i });
        expect(link.getAttribute("href")).toContain("recreation.gov/camping/campsites/");
        expect(link.getAttribute("href")).toContain("arrivalDate=2026-05-23");
    });

    it("shows a count of open favorites on the campground row", () => {
        render(<AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} defaultExpandFirst />);
        // Outlet: A-07 (favorite) is open, Z-99 (favorite) is booked -> "★ 1 open".
        expect(screen.getByText(/1 open/)).toBeTruthy();
    });

    it("fires onEditSettings from a row's configure button", () => {
        const calls: string[] = [];
        render(
            <AvailabilityTimeline
                rows={ROWS}
                dateRange={DATE_RANGE}
                defaultExpandFirst
                onEditSettings={(id) => calls.push(id)}
            />,
        );
        const outletRow = screen.getByText("Outlet").closest('[role="button"]') as HTMLElement;
        fireEvent.click(within(outletRow).getByLabelText(/Configure Outlet/));
        expect(calls).toEqual(["1"]);
    });

    it("renders blacked-out nights in a grey segment instead of green/mustard", () => {
        const blackouts: BlackoutRange[] = [{ from: "2026-05-23", to: "2026-05-23" }];
        const settings: SiteSettingsValue = {
            dates: { stayLengths: [2], validStartDays: ["Saturday"], blackoutDates: blackouts },
        };
        render(
            <SiteSettingsContext.Provider value={settings}>
                <AvailabilityTimeline rows={ROWS} dateRange={DATE_RANGE} defaultExpandFirst />
            </SiteSettingsContext.Provider>,
        );
        // A-07 has a match May 23–25; the May 23 block has a title containing "May 23".
        const blocks = screen.getAllByTitle(/May 23/);
        // Each block renders inner segment divs with inline background styles. With the
        // blackout on May 23, the first segment (night May 23) uses CW.inkFaint
        // instead of the forest-green open color.
        const hasGreySeg = blocks.some((b) => {
            const segs = b.querySelectorAll<HTMLElement>("div.flex-1");
            return Array.from(segs).some((s) => s.style.background === "var(--cw-ink-faint)");
        });
        expect(hasGreySeg).toBe(true);
    });
});
