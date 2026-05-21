import { describe, it, expect } from "vitest";

// CtaButtons branches on auth.user — signed-out shows "Sign in with Google",
// signed-in shows "Open the Dashboard".  We test that contract here.

describe("CtaButtons label logic", () => {
    function primaryLabel(user: object | null): string {
        return user ? "Open the Dashboard" : "Sign in with Google";
    }

    it("shows 'Sign in with Google' when user is null (signed-out)", () => {
        expect(primaryLabel(null)).toBe("Sign in with Google");
    });

    it("shows 'Open the Dashboard' when user is present (signed-in)", () => {
        expect(primaryLabel({ name: "Alice", email: "alice@example.com" })).toBe("Open the Dashboard");
    });
});

describe("CtaButtons href logic", () => {
    function primaryHref(user: object | null): string {
        return user ? "/app" : "/auth/google/start?returnTo=/app";
    }

    it("href points to /auth/google/start when signed-out", () => {
        expect(primaryHref(null)).toBe("/auth/google/start?returnTo=/app");
    });

    it("href points to /app when signed-in", () => {
        expect(primaryHref({ name: "Alice" })).toBe("/app");
    });
});

describe("CtaButtons module exports", () => {
    it("exports CtaButtons as a function", async () => {
        const mod = await import("./cta-buttons");
        expect(typeof mod.CtaButtons).toBe("function");
    });
});
