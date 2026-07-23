import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TripsCard, weekendWindow } from "./trips-card";
import type { TripWindow, ProcessedCampground } from "@/types/campground";

const win: TripWindow = { id: "w1", from: "2100-07-31", to: "2100-08-02", label: "Lake weekend" };
const cgWithHit = {
    id: "233563",
    name: "Point",
    sites: { favorites: [], worthwhile: [] },
    siteAvailability: {},
    tripMatches: [
        {
            windowId: "w1",
            campgroundId: "233563",
            campgroundName: "Point",
            siteId: "111",
            siteName: "A01",
            tier: "favorites",
            run: { from: "2100-07-31", to: "2100-08-02", nights: 2 },
        },
    ],
} as unknown as ProcessedCampground;

describe("weekendWindow", () => {
    it("Wednesday resolves to the coming Fri->Sun", () => {
        expect(weekendWindow(0, new Date("2026-07-22T12:00:00"))).toEqual({
            from: "2026-07-24",
            to: "2026-07-26",
        });
    });
    it("Saturday clamps arrival to today", () => {
        expect(weekendWindow(0, new Date("2026-07-25T12:00:00"))).toEqual({
            from: "2026-07-25",
            to: "2026-07-26",
        });
    });
    it("next weekend adds seven days", () => {
        expect(weekendWindow(1, new Date("2026-07-22T12:00:00"))).toEqual({
            from: "2026-07-31",
            to: "2026-08-02",
        });
    });
});

describe("TripsCard", () => {
    it("renders windows with live match counts", () => {
        render(
            <TripsCard
                tripWindows={[win]}
                campgrounds={[]}
                campgroundsByAreas={[cgWithHit]}
                onChange={vi.fn()}
                isMobile={false}
            />,
        );
        expect(screen.getByText("Lake weekend")).toBeTruthy();
        expect(screen.getByText(/1 site matches now/i)).toBeTruthy();
    });

    it("delete calls onChange without the window", () => {
        const onChange = vi.fn();
        render(
            <TripsCard
                tripWindows={[win]}
                campgrounds={[]}
                campgroundsByAreas={[]}
                onChange={onChange}
                isMobile={false}
            />,
        );
        fireEvent.click(screen.getByLabelText("Remove trip"));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("quick-add chip adds a weekend window", () => {
        const onChange = vi.fn();
        render(
            <TripsCard
                tripWindows={[]}
                campgrounds={[]}
                campgroundsByAreas={[]}
                onChange={onChange}
                isMobile={false}
            />,
        );
        fireEvent.click(screen.getByText("This weekend"));
        const arg = onChange.mock.calls[0]![0] as TripWindow[];
        expect(arg).toHaveLength(1);
        expect(arg[0]!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(arg[0]!.to > arg[0]!.from).toBe(true);
    });

    it("quick-add does not fire when at cap (10 windows)", () => {
        const onChange = vi.fn();
        const maxedWindows = Array.from({ length: 10 }, (_, i) => ({
            id: `w${i}`,
            from: "2100-07-01",
            to: "2100-07-03",
        })) as TripWindow[];
        render(
            <TripsCard
                tripWindows={maxedWindows}
                campgrounds={[]}
                campgroundsByAreas={[]}
                onChange={onChange}
                isMobile={false}
            />,
        );
        fireEvent.click(screen.getByText("This weekend"));
        expect(onChange).not.toHaveBeenCalled();
    });
});
