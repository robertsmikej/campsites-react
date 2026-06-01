import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { WatchlistRow } from "./watchlist-row";
import type { ProcessedCampground } from "@/types/campground";

// Guards the "I don't see more than ~30 ticks" bug. The strip used to downsample
// to a hard max of 42 bars, so a longer window never showed more ticks. It now
// renders one flex tick per day across the whole window.

function makeCampground(): ProcessedCampground {
    return {
        id: "cg1",
        name: "Redfish Outlet",
        area: "Sawtooths",
        sites: { favorites: [], worthwhile: [] },
        siteAvailability: {},
    };
}

function windowOf(days: number): { start: Date; end: Date } {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 1);
    end.setDate(end.getDate() + days - 1);
    return { start, end };
}

function renderRow(days: number) {
    const { start, end } = windowOf(days);
    return render(
        <WatchlistRow
            campground={makeCampground()}
            isFavorite={false}
            onToggleFavorite={() => {}}
            openCount={0}
            windowStart={start}
            windowEnd={end}
            settings={{}}
            isMobile={false}
            readOnly
        />,
    );
}

describe("WatchlistRow availability strip", () => {
    it("renders one tick per day for a 120-day window (no 42 cap)", () => {
        renderRow(120);
        expect(screen.getByTestId("availability-bars").children.length).toBe(120);
    });

    it("renders one tick per day for a 90-day window", () => {
        renderRow(90);
        expect(screen.getByTestId("availability-bars").children.length).toBe(90);
    });

    it("shows every day for a short window too", () => {
        renderRow(30);
        expect(screen.getByTestId("availability-bars").children.length).toBe(30);
    });
});
