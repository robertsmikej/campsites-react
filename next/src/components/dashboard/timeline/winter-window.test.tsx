import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AvailabilityTimeline } from "./availability-timeline";
import { getGroupDefaultRange } from "@/hooks/use-group-date-range";
import type { ProcessedCampground } from "@/types/campground";

// Real shape of the Redfish Cabin group: one campground, watched Sep 1 2026 –
// Mar 31 2027, with its only opening in late February.
const GROUP_WINDOW = { start: "2026-09-01", end: "2027-03-31" };

const CABIN = {
    id: "233348",
    name: "Redfish Cabin",
    area: "Redfish Cabin",
    sites: { favorites: ["RF01"], worthwhile: [] },
    totalSitesCount: 1,
    siteAvailability: {
        "79805": {
            siteId: "79805",
            siteName: "RF01",
            campsite_type: "CABIN ELECTRIC",
            dates: [],
            excludedMatches: [],
            matches: [{ from: "2027-02-22", to: "2027-02-26", nights: 4 }],
        },
    },
} as unknown as ProcessedCampground;

beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 30)); // Aug 30 2026, just before the window opens
});
afterAll(() => {
    vi.useRealTimers();
});

describe("off-season group timeline", () => {
    it("puts a February opening on the axis for a Sep–Mar watch window", () => {
        const dateRange = getGroupDefaultRange(GROUP_WINDOW);
        render(<AvailabilityTimeline rows={[CABIN]} dateRange={dateRange} skipSeasonClamp />);

        // The axis has to reach March 2027, not stop in December.
        expect(screen.getByText("Mar")).toBeTruthy();
        expect(screen.getAllByText("2027").length).toBeGreaterThan(0);

        // ...and the opening itself renders.
        expect(document.querySelector('[title="Mon Feb 22 – Thu Feb 25 · 4 nights"]')).toBeTruthy();
    });
});
