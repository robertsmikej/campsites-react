import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Greeting } from "./greeting";
import type { AuthState } from "@/hooks/use-auth";

const baseAuth: AuthState = {
    user: null,
    isLoading: false,
    isCurator: false,
    refresh: async () => {},
};

function mockHour(hour: number) {
    const now = new Date();
    now.setHours(hour, 0, 0, 0);
    vi.setSystemTime(now);
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("Greeting — time-of-day branch", () => {
    it("shows 'GOOD MORNING' for hour 8", () => {
        mockHour(8);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/good morning/i)).toBeInTheDocument();
    });

    it("shows 'GOOD AFTERNOON' for hour 14", () => {
        mockHour(14);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/good afternoon/i)).toBeInTheDocument();
    });

    it("shows 'GOOD EVENING' for hour 20", () => {
        mockHour(20);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/good evening/i)).toBeInTheDocument();
    });
});

describe("Greeting — user name", () => {
    it("extracts first name from full name", () => {
        mockHour(10);
        const auth: AuthState = {
            ...baseAuth,
            user: { name: "Alice Smith", email: "alice@example.com", roles: [], createdAt: "2025-01-01" },
        };
        render(<Greeting auth={auth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/alice\./i)).toBeInTheDocument();
    });

    it("falls back to 'there' when user is null", () => {
        mockHour(10);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/there\./i)).toBeInTheDocument();
    });
});

describe("Greeting — status sentence", () => {
    it("shows loading message when isLoading=true", () => {
        mockHour(10);
        render(<Greeting auth={baseAuth} isLoading={true} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/checking your campgrounds/i)).toBeInTheDocument();
    });

    it("shows no-bookable-sites copy when count is 0", () => {
        mockHour(10);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={0} />);
        expect(screen.getByText(/no bookable sites/i)).toBeInTheDocument();
    });

    it("shows campground count when openings exist", () => {
        mockHour(10);
        render(<Greeting auth={baseAuth} isLoading={false} campgroundsWithOpenings={3} />);
        // The count is in a <strong> node, text around it in sibling spans
        expect(screen.getByText(/3/)).toBeInTheDocument();
        expect(screen.getByText(/bookable sites for your dates/i)).toBeInTheDocument();
    });
});
