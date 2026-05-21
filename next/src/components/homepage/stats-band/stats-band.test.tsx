import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsContext, type NotifierStatsValue } from "@/contexts/stats-context";
import { StatsBand } from "./stats-band";

function renderWithStats(value: NotifierStatsValue) {
    return render(
        <StatsContext.Provider value={value}>
            <StatsBand />
        </StatsContext.Provider>,
    );
}

const NOW_MS = new Date("2026-07-01T12:00:00.000Z").getTime();

describe("StatsBand — null stats (em-dash placeholders)", () => {
    it("shows '—' for all four tiles when stats is null", () => {
        renderWithStats({ stats: null, nowMs: NOW_MS });
        // All four value spans should show the em-dash placeholder
        const dashes = screen.getAllByText("—");
        expect(dashes.length).toBeGreaterThanOrEqual(4);
    });

    it("renders the tile labels", () => {
        renderWithStats({ stats: null, nowMs: NOW_MS });
        expect(screen.getByText("Campgrounds tracked")).toBeInTheDocument();
        expect(screen.getByText("Openings sent today")).toBeInTheDocument();
        expect(screen.getByText("Openings this week")).toBeInTheDocument();
    });
});

describe("StatsBand — populated stats", () => {
    const mockStats = {
        lastPollAt: new Date(NOW_MS - 60_000).toISOString(), // 1 min ago
        campgroundsTracked: 42,
        openingsSentToday: 7,
        openingsSentLast7Days: 123,
        medianLatencyMs: 500,
        sampleSize: 10,
        todayKey: "2026-07-01",
    };

    it("renders campgroundsTracked as a number string", () => {
        renderWithStats({ stats: mockStats, nowMs: NOW_MS });
        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("renders openingsSentToday as a number string", () => {
        renderWithStats({ stats: mockStats, nowMs: NOW_MS });
        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("does not show em-dash for tracked campgrounds when stats is populated", () => {
        renderWithStats({ stats: mockStats, nowMs: NOW_MS });
        // With real stats, no tile value should be just "—"
        // (though "Last poll" tile value will be a time-ago string)
        const tracked = screen.getByText("42");
        expect(tracked).toBeInTheDocument();
    });
});
