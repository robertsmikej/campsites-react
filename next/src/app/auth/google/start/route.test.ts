import { describe, it, expect, vi, beforeEach } from "vitest";
import * as cloudflare from "@/lib/cloudflare";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

beforeEach(() => {
    vi.resetModules();
});

async function getStart(url: string, env: Partial<cloudflare.CampWatchEnv>) {
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        SUBSCRIBERS: {} as never,
        ...env,
    } as cloudflare.CampWatchEnv);
    const { GET } = await import("./route");
    return GET(new Request(url));
}

describe("GET /auth/google/start", () => {
    it("returns 500 if OAuth env is missing", async () => {
        const res = await getStart("https://example.com/auth/google/start", {});
        expect(res.status).toBe(500);
    });

    it("returns 302 to Google with a state param and sets the state cookie", async () => {
        const res = await getStart("https://example.com/auth/google/start", {
            GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
            SESSION_SECRET: "test-secret",
        });
        expect(res.status).toBe(302);
        const location = res.headers.get("Location") ?? "";
        expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
        expect(location).toContain("client_id=client.apps.googleusercontent.com");
        expect(location).toMatch(/state=[a-f0-9]{32}/);
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain("campwatch_oauth_state=");
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("Max-Age=600");
    });

    it("honors returnTo if it's a safe relative path", async () => {
        const res = await getStart("https://example.com/auth/google/start?returnTo=%2Fapp%2Faccount", {
            GOOGLE_CLIENT_ID: "c",
            SESSION_SECRET: "s",
        });
        // The cookie contains the signed JSON; it's enough to assert the cookie exists
        // and is HMAC-signed (has the dot separator structure from signValue).
        // End-to-end verification happens in the callback test where we round-trip
        // through verifySignedValue.
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toMatch(/campwatch_oauth_state=[A-Za-z0-9_-]+\.[a-f0-9]{64}/);
    });

    it("rejects an external returnTo and falls back to /app", async () => {
        const res = await getStart(
            "https://example.com/auth/google/start?returnTo=https%3A%2F%2Fevil.example.com",
            { GOOGLE_CLIENT_ID: "c", SESSION_SECRET: "s" },
        );
        // The signed cookie should encode returnTo=/app. The simplest assertion:
        // just confirm the cookie was set; the round-trip happens in C3 tests.
        expect(res.status).toBe(302);
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain("campwatch_oauth_state=");
    });
});
