import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
    usePathname: vi.fn(() => "/app"),
}));

import { DashboardTopBar } from "./dashboard-top-bar";
import type { AuthState } from "@/hooks/use-auth";

const signedIn: AuthState = {
    user: { email: "mike@example.com", name: "Mike" } as never,
    isLoading: false,
    isCurator: false,
    refresh: vi.fn(async () => {}),
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("DashboardTopBar refresh button", () => {
    it("calls onRefresh when clicked", () => {
        const onRefresh = vi.fn();
        render(<DashboardTopBar auth={signedIn} onRefresh={onRefresh} />);
        fireEvent.click(screen.getByRole("button", { name: /refresh availability/i }));
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("spins the icon and disables the button while refreshing", () => {
        render(<DashboardTopBar auth={signedIn} onRefresh={vi.fn()} isRefreshing />);
        const button = screen.getByRole("button", { name: /refresh availability/i });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(button.querySelector(".animate-spin")).toBeTruthy();
    });

    it("is not rendered when onRefresh is absent (non-dashboard pages)", () => {
        render(<DashboardTopBar auth={signedIn} />);
        expect(screen.queryByRole("button", { name: /refresh availability/i })).toBeNull();
    });

    it("is not rendered for a signed-out visitor", () => {
        const signedOut: AuthState = { ...signedIn, user: null };
        render(<DashboardTopBar auth={signedOut} onRefresh={vi.fn()} />);
        expect(screen.queryByRole("button", { name: /refresh availability/i })).toBeNull();
    });

    it("shows the freshness label when provided", () => {
        render(<DashboardTopBar auth={signedIn} onRefresh={vi.fn()} lastUpdatedLabel="5m ago" />);
        expect(screen.getByText(/updated 5m ago/i)).toBeTruthy();
    });

    it("omits the freshness label when not provided", () => {
        render(<DashboardTopBar auth={signedIn} onRefresh={vi.fn()} />);
        expect(screen.queryByText(/updated/i)).toBeNull();
    });
});
