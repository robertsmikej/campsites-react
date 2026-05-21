import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OpeningCard } from "./opening-card";
import type { OpeningItem } from "./openings-feed";

// nowMs = 2026-07-01 00:00:00 UTC
const NOW_MS = new Date("2026-07-01T00:00:00.000Z").getTime();

const baseItem: OpeningItem = {
    id: "item-1",
    campgroundId: "cg-1",
    campgroundName: "Granite Peak Campground",
    siteId: "site-1",
    siteName: "A14",
    from: "2026-08-01", // 31 days out — NEW
    to: "2026-08-03",
    nights: 2,
    recGovId: "233881",
    detectedAt: new Date(NOW_MS - 30_000).toISOString(), // 30s ago
};

describe("OpeningCard — NEW tag (arrival >= 14 days out)", () => {
    it("renders the NEW tag", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText("NEW")).toBeInTheDocument();
    });

    it("does not render CANCEL tag", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.queryByText("CANCEL")).toBeNull();
    });
});

describe("OpeningCard — CANCEL tag (arrival < 14 days out)", () => {
    const cancelItem: OpeningItem = {
        ...baseItem,
        from: "2026-07-08", // 7 days out — CANCEL
        to: "2026-07-10",
        nights: 2,
    };

    it("renders the CANCEL tag", () => {
        render(<OpeningCard item={cancelItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText("CANCEL")).toBeInTheDocument();
    });

    it("does not render NEW tag", () => {
        render(<OpeningCard item={cancelItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.queryByText("NEW")).toBeNull();
    });
});

describe("OpeningCard — content", () => {
    it("renders the campground name", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText("Granite Peak Campground")).toBeInTheDocument();
    });

    it("renders the site name", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText(/site a14/i)).toBeInTheDocument();
    });

    it("renders the nights label with correct pluralization", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText(/2 nights/i)).toBeInTheDocument();
    });

    it("uses 'night' singular for a 1-night stay", () => {
        const singleNight: OpeningItem = { ...baseItem, nights: 1, to: "2026-08-02" };
        render(<OpeningCard item={singleNight} isMobile={false} nowMs={NOW_MS} />);
        expect(screen.getByText(/1 night$/i)).toBeInTheDocument();
    });

    it("renders a rec.gov booking link", () => {
        render(<OpeningCard item={baseItem} isMobile={false} nowMs={NOW_MS} />);
        const link = screen.getByRole("link", { name: /book on rec\.gov/i });
        expect(link).toHaveAttribute("href", "https://www.recreation.gov/camping/campgrounds/233881");
    });

    it("falls back to rec.gov homepage when recGovId is absent", () => {
        const noId: OpeningItem = { ...baseItem, recGovId: undefined };
        render(<OpeningCard item={noId} isMobile={false} nowMs={NOW_MS} />);
        const link = screen.getByRole("link", { name: /book on rec\.gov/i });
        expect(link).toHaveAttribute("href", "https://www.recreation.gov");
    });
});
