import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AvailabilityTimeline } from "./availability-timeline";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

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

    it("hides a tier's site rows when its show toggle is off", () => {
        const rows = [
            {
                id: "9",
                name: "Outlet",
                area: "",
                sites: { favorites: ["A-07"], worthwhile: [] },
                showOrHide: { Favorites: false, Worthwhile: true, "All Others": true },
                totalSitesCount: 2,
                siteAvailability: {
                    "A-07": site("A-07", [["2026-05-23", "2026-05-25"]]), // favorite, open
                    "016": site("016", [["2026-05-23", "2026-05-25"]]), // other, open
                },
            } as unknown as ProcessedCampground,
        ];
        render(<AvailabilityTimeline rows={rows} dateRange={DATE_RANGE} defaultExpandFirst />);
        expect(screen.queryByText("Site A-07")).toBeNull(); // favorites hidden by the toggle
        expect(screen.getByText("Site 016")).toBeTruthy(); // "all others" still shown
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
});
