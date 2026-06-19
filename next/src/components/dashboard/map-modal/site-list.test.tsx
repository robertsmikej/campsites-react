import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SiteList } from "./site-list";
import type { MapSite } from "@/lib/map-sites";
import type { AdjacentGroup } from "@/types/campground";

afterEach(cleanup);

const sites: MapSite[] = [
    {
        id: "A-07",
        campsiteId: "1",
        lat: 44.1,
        lng: -114.9,
        type: "tent",
        rating: 4,
        reviews: 3,
        cell: 3,
        amenities: {},
        open: true,
        openCount: 5,
        tier: "fav",
    },
    {
        id: "B-23",
        campsiteId: "2",
        lat: 44.2,
        lng: -114.8,
        type: "rv",
        maxRvLength: 35,
        rating: null,
        reviews: 0,
        cell: 1,
        amenities: {},
        open: false,
        openCount: 0,
        tier: "worth",
    },
];

it("renders a row per site with the header count", () => {
    render(
        <SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={() => {}} onHover={() => {}} />,
    );
    expect(screen.getByText("A-07")).toBeTruthy();
    expect(screen.getByText("B-23")).toBeTruthy();
    expect(screen.getByText("2 sites · 1 open")).toBeTruthy();
});

it("shows Book only for open sites", () => {
    render(
        <SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={() => {}} onHover={() => {}} />,
    );
    const books = screen.getAllByText(/Book/i);
    expect(books).toHaveLength(1); // only A-07 is open
});

it("fires onSelect when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
        <SiteList sites={sites} selectedId={null} hoveredId={null} onSelect={onSelect} onHover={() => {}} />,
    );
    fireEvent.click(screen.getByText("A-07"));
    expect(onSelect).toHaveBeenCalledWith("A-07");
});

it("labels an adjacent group with its sites and dates", () => {
    const adjacentSites: MapSite[] = [
        {
            id: "012",
            campsiteId: "10",
            lat: 44.1,
            lng: -114.9,
            type: "tent",
            rating: null,
            reviews: 0,
            cell: 2,
            amenities: {},
            open: true,
            openCount: 3,
            tier: "fav",
        },
        {
            id: "013",
            campsiteId: "11",
            lat: 44.11,
            lng: -114.91,
            type: "tent",
            rating: null,
            reviews: 0,
            cell: 2,
            amenities: {},
            open: true,
            openCount: 3,
            tier: "worth",
        },
    ];
    const group: AdjacentGroup = {
        campgroundId: "cg1",
        siteIds: ["012", "013"],
        siteNames: ["012", "013"],
        from: "2026-06-10",
        to: "2026-06-14",
        nights: 4,
        anchorTier: "favorites",
    };
    render(
        <SiteList
            sites={adjacentSites}
            selectedId={null}
            hoveredId={null}
            onSelect={() => {}}
            onHover={() => {}}
            adjacentGroups={[group]}
        />,
    );
    expect(screen.getByText(/Adjacent group/i)).toBeInTheDocument();
    expect(screen.getAllByText(/012/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Jun 1\d/)).toBeInTheDocument();
});
