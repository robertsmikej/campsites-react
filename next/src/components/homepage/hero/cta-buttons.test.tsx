import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CtaButtons } from "./cta-buttons";
import type { AuthState } from "@/hooks/use-auth";

const baseAuth: AuthState = {
    user: null,
    isLoading: false,
    isCurator: false,
    refresh: async () => {},
};

describe("CtaButtons — signed out", () => {
    it("renders 'Sign in with Google' link text", () => {
        render(<CtaButtons auth={{ ...baseAuth, user: null }} />);
        expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });

    it("primary link href points to the OAuth start URL", () => {
        render(<CtaButtons auth={{ ...baseAuth, user: null }} />);
        const link = screen.getByRole("link", { name: /sign in with google/i });
        expect(link).toHaveAttribute("href", "/auth/google/start?returnTo=/app");
    });
});

describe("CtaButtons — signed in", () => {
    const signedIn: AuthState = {
        ...baseAuth,
        user: { name: "Alice Smith", email: "alice@example.com", roles: [], createdAt: "2025-01-01" },
    };

    it("renders 'Open the Dashboard' link text", () => {
        render(<CtaButtons auth={signedIn} />);
        expect(screen.getByText("Open the Dashboard")).toBeInTheDocument();
    });

    it("primary link href points to /app", () => {
        render(<CtaButtons auth={signedIn} />);
        const link = screen.getByRole("link", { name: /open the dashboard/i });
        expect(link).toHaveAttribute("href", "/app");
    });
});

describe("CtaButtons — loading", () => {
    it("renders neither primary text while loading", () => {
        render(<CtaButtons auth={{ ...baseAuth, isLoading: true }} />);
        expect(screen.queryByText("Sign in with Google")).toBeNull();
        expect(screen.queryByText("Open the Dashboard")).toBeNull();
    });
});
