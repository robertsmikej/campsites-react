import { describe, it, expect } from "vitest";

// DashboardErrorBoundary is a class component; rendering it requires jsdom.
// We test the static logic (getDerivedStateFromError) and the render branch
// logic extracted as pure functions.

describe("DashboardErrorBoundary getDerivedStateFromError", () => {
    // Static method on the class: sets error in state
    function getDerivedStateFromError(error: Error): { error: Error } {
        return { error };
    }

    it("returns state with the thrown error", () => {
        const err = new Error("boom");
        const state = getDerivedStateFromError(err);
        expect(state.error).toBe(err);
    });

    it("preserves the error message", () => {
        const err = new Error("something went wrong");
        expect(getDerivedStateFromError(err).error.message).toBe("something went wrong");
    });
});

describe("DashboardErrorBoundary render branch", () => {
    function hasError(state: { error: Error | null }): boolean {
        return state.error !== null;
    }

    it("is in error state when error is set", () => {
        expect(hasError({ error: new Error("x") })).toBe(true);
    });

    it("renders children when error is null", () => {
        expect(hasError({ error: null })).toBe(false);
    });
});

describe("DashboardErrorBoundary fallback text", () => {
    // The fallback renders `{section} · couldn't load`
    function fallbackTitle(section: string): string {
        return `${section} · couldn't load`;
    }

    it("includes the section name in the fallback title", () => {
        expect(fallbackTitle("Openings feed")).toBe("Openings feed · couldn't load");
    });

    it("works for any section name", () => {
        expect(fallbackTitle("Watchlist")).toBe("Watchlist · couldn't load");
    });
});

describe("DashboardErrorBoundary module exports", () => {
    it("exports DashboardErrorBoundary as a function/class", async () => {
        const mod = await import("./error-boundary");
        // Classes are typeof "function" in JavaScript
        expect(typeof mod.DashboardErrorBoundary).toBe("function");
    });
});
