// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";
import { signValue } from "@/lib/crypto-helpers";
import type { GoogleTokenResponse, GoogleIdTokenPayload } from "@/lib/google-oauth";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

vi.mock("@/lib/google-oauth", () => ({
    exchangeCodeForToken: vi.fn(),
    verifyIdToken: vi.fn(),
}));

const SESSION_SECRET = "test-session-secret";
const CLIENT_ID = "client.apps.googleusercontent.com";
const CLIENT_SECRET = "client-secret";

const MOCK_TOKEN: GoogleTokenResponse = {
    id_token: "mock.id.token",
    access_token: "mock-access-token",
    expires_in: 3600,
    scope: "openid email profile",
    token_type: "Bearer",
};

const MOCK_PAYLOAD: GoogleIdTokenPayload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
};

beforeEach(() => {
    vi.resetModules();
});

async function buildStateCookie(state: string, returnTo = "/app"): Promise<string> {
    const inner = JSON.stringify({ state, returnTo });
    return signValue(inner, SESSION_SECRET);
}

async function callCallback(opts: {
    code?: string;
    state?: string;
    stateCookieValue?: string;
    kv?: ReturnType<typeof createMockKv>;
}) {
    const kv = opts.kv ?? createMockKv();
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        SUBSCRIBERS: kv,
        GOOGLE_CLIENT_ID: CLIENT_ID,
        GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
        SESSION_SECRET,
    } as cloudflare.CampWatchEnv);
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);

    const params = new URLSearchParams();
    if (opts.code) params.set("code", opts.code);
    if (opts.state) params.set("state", opts.state);

    const headers: Record<string, string> = {};
    if (opts.stateCookieValue) {
        headers.Cookie = `campwatch_oauth_state=${opts.stateCookieValue}`;
    }

    const { GET } = await import("./route");
    return GET(new Request(`https://example.com/auth/google/callback?${params.toString()}`, { headers }));
}

describe("GET /auth/google/callback — success", () => {
    it("302 to /app, sets session cookie, clears state cookie", async () => {
        const { exchangeCodeForToken, verifyIdToken } = await import("@/lib/google-oauth");
        vi.mocked(exchangeCodeForToken).mockResolvedValue(MOCK_TOKEN);
        vi.mocked(verifyIdToken).mockResolvedValue(MOCK_PAYLOAD);

        const state = "abc123stateval";
        const kv = createMockKv();
        const signed = await buildStateCookie(state);

        const res = await callCallback({ code: "auth-code", state, stateCookieValue: signed, kv });

        expect(res.status).toBe(302);
        const location = res.headers.get("Location") ?? "";
        expect(location).toContain("/app");

        // Two Set-Cookie headers: session + clearing state cookie
        const cookies = res.headers.getSetCookie
            ? res.headers.getSetCookie()
            : [res.headers.get("Set-Cookie") ?? ""];
        const allCookies = cookies.join(", ");
        expect(allCookies).toContain("campwatch_session=");
        expect(allCookies).toContain("campwatch_oauth_state=;");

        // Profile and session should be stored in KV
        const profile = (await kv.get("user:user@example.com:profile", "json")) as { name: string } | null;
        expect(profile?.name).toBe("Test User");

        // At least one session key should be in KV
        const sessionList = await kv.list({ prefix: "session:" });
        expect(sessionList.keys.length).toBeGreaterThan(0);
    });

    it("honors returnTo from the state cookie", async () => {
        const { exchangeCodeForToken, verifyIdToken } = await import("@/lib/google-oauth");
        vi.mocked(exchangeCodeForToken).mockResolvedValue(MOCK_TOKEN);
        vi.mocked(verifyIdToken).mockResolvedValue(MOCK_PAYLOAD);

        const state = "ret-state";
        const inner = JSON.stringify({ state, returnTo: "/app/account" });
        const signed = await signValue(inner, SESSION_SECRET);

        const res = await callCallback({ code: "code", state, stateCookieValue: signed });

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("/app/account");
    });
});

describe("GET /auth/google/callback — failures", () => {
    it("302 to /?authError=missing_params when code is absent", async () => {
        const state = "s";
        const signed = await buildStateCookie(state);
        const res = await callCallback({ state, stateCookieValue: signed });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=missing_params");
    });

    it("302 to /?authError=missing_params when state is absent", async () => {
        const signed = await buildStateCookie("s");
        const res = await callCallback({ code: "code", stateCookieValue: signed });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=missing_params");
    });

    it("302 to /?authError=missing_state_cookie when cookie is absent", async () => {
        const res = await callCallback({ code: "code", state: "s" });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=missing_state_cookie");
    });

    it("302 to /?authError=state_mismatch when state param doesn't match cookie", async () => {
        const signed = await buildStateCookie("correct-state");
        const res = await callCallback({
            code: "code",
            state: "wrong-state",
            stateCookieValue: signed,
        });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=state_mismatch");
    });

    it("302 to /?authError=token_exchange_failed when exchangeCodeForToken throws", async () => {
        const { exchangeCodeForToken } = await import("@/lib/google-oauth");
        vi.mocked(exchangeCodeForToken).mockRejectedValue(new Error("network error"));

        const state = "s";
        const signed = await buildStateCookie(state);
        const res = await callCallback({ code: "code", state, stateCookieValue: signed });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=token_exchange_failed");
    });

    it("302 to /?authError=verify_failed when verifyIdToken throws", async () => {
        const { exchangeCodeForToken, verifyIdToken } = await import("@/lib/google-oauth");
        vi.mocked(exchangeCodeForToken).mockResolvedValue(MOCK_TOKEN);
        vi.mocked(verifyIdToken).mockRejectedValue(new Error("bad sig"));

        const state = "s";
        const signed = await buildStateCookie(state);
        const res = await callCallback({ code: "code", state, stateCookieValue: signed });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toContain("authError=verify_failed");
    });

    it("clears the state cookie even on failure", async () => {
        const res = await callCallback({ code: "code", state: "s" });
        const cookies = res.headers.getSetCookie
            ? res.headers.getSetCookie()
            : [res.headers.get("Set-Cookie") ?? ""];
        const allCookies = cookies.join(", ");
        expect(allCookies).toContain("campwatch_oauth_state=;");
        expect(allCookies).toContain("Max-Age=0");
    });
});
