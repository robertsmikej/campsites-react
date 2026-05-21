import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DashboardErrorBoundary } from "./error-boundary";

function Bomb(): never {
    throw new Error("test explosion");
}

function Safe() {
    return <div>All good</div>;
}

// Suppress React's error boundary console output during these tests
function suppressConsoleError() {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    return () => spy.mockRestore();
}

describe("DashboardErrorBoundary — error fallback", () => {
    it("renders fallback content when a child throws", () => {
        const restore = suppressConsoleError();
        render(
            <DashboardErrorBoundary section="Openings feed">
                <Bomb />
            </DashboardErrorBoundary>,
        );
        restore();
        expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    });

    it("includes the section name in the fallback", () => {
        const restore = suppressConsoleError();
        render(
            <DashboardErrorBoundary section="Openings feed">
                <Bomb />
            </DashboardErrorBoundary>,
        );
        restore();
        expect(screen.getByText(/openings feed/i)).toBeInTheDocument();
    });

    it("shows the 'refresh the page' recovery hint", () => {
        const restore = suppressConsoleError();
        render(
            <DashboardErrorBoundary section="Watchlist">
                <Bomb />
            </DashboardErrorBoundary>,
        );
        restore();
        expect(screen.getByText(/refresh the page/i)).toBeInTheDocument();
    });
});

describe("DashboardErrorBoundary — happy path", () => {
    it("renders children when no error is thrown", () => {
        render(
            <DashboardErrorBoundary section="Openings feed">
                <Safe />
            </DashboardErrorBoundary>,
        );
        expect(screen.getByText("All good")).toBeInTheDocument();
    });

    it("does not render the fallback when children are healthy", () => {
        render(
            <DashboardErrorBoundary section="Openings feed">
                <Safe />
            </DashboardErrorBoundary>,
        );
        expect(screen.queryByText(/couldn't load/i)).toBeNull();
    });
});
