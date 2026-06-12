import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MapSummary } from "./map-summary";
import type { MapSite } from "@/lib/map-sites";

afterEach(cleanup);

const makeSite = (overrides: Partial<MapSite>): MapSite => ({
    id: "001",
    campsiteId: "1",
    lat: 44.1,
    lng: -114.9,
    type: "tent",
    rating: null,
    reviews: 0,
    cell: null,
    amenities: {},
    open: false,
    openCount: 0,
    tier: "other",
    ...overrides,
});

const sites: MapSite[] = [
    makeSite({ id: "001", open: true, tier: "fav", rating: 4 }),
    makeSite({ id: "002", open: true, tier: "fav", rating: 3 }),
    makeSite({ id: "003", open: false, tier: "worth", rating: 5 }),
    makeSite({ id: "004", open: false, tier: "other", rating: null }),
];

describe("MapSummary", () => {
    it("shows open/total tile", () => {
        render(<MapSummary sites={sites} />);
        expect(screen.getByText("2/4")).toBeTruthy();
    });

    it("shows favorite count tile", () => {
        render(<MapSummary sites={sites} />);
        expect(screen.getByText("2")).toBeTruthy(); // 2 favs
    });

    it("shows avg rating (mean of non-null values)", () => {
        render(<MapSummary sites={sites} />);
        // ratings: [4, 3, 5] → avg 4.0
        expect(screen.getByText("4.0")).toBeTruthy();
    });

    it("shows em-dash when no ratings are available", () => {
        render(<MapSummary sites={[makeSite({ rating: null })]} />);
        expect(screen.getByText("—")).toBeTruthy();
    });

    it("renders all three tile labels", () => {
        render(<MapSummary sites={sites} />);
        expect(screen.getByText(/Sites open/i)).toBeTruthy();
        expect(screen.getByText(/Favorites/i)).toBeTruthy();
        expect(screen.getByText(/Avg rating/i)).toBeTruthy();
    });
});
