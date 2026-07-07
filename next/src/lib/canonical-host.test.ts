import { describe, it, expect } from "vitest";
import { canonicalRedirectUrl } from "./canonical-host";

describe("canonicalRedirectUrl", () => {
    it("redirects www to the apex, preserving path and query", () => {
        expect(canonicalRedirectUrl("www.campwatch.dev", "/", "")).toBe("https://campwatch.dev/");
        expect(canonicalRedirectUrl("www.campwatch.dev", "/app", "?tab=map")).toBe(
            "https://campwatch.dev/app?tab=map",
        );
        expect(canonicalRedirectUrl("www.campwatch.dev", "/discover", "")).toBe(
            "https://campwatch.dev/discover",
        );
    });

    it("matches the www host case-insensitively", () => {
        expect(canonicalRedirectUrl("WWW.CampWatch.dev", "/", "")).toBe("https://campwatch.dev/");
    });

    it("returns null for the apex host", () => {
        expect(canonicalRedirectUrl("campwatch.dev", "/app", "?tab=map")).toBeNull();
    });

    it("returns null for local dev and other hosts", () => {
        expect(canonicalRedirectUrl("localhost:3000", "/", "")).toBeNull();
        expect(canonicalRedirectUrl("campwatch.example.workers.dev", "/", "")).toBeNull();
    });

    it("returns null when the host header is missing", () => {
        expect(canonicalRedirectUrl(null, "/", "")).toBeNull();
    });
});
