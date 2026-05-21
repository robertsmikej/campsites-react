// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";
import { createSession, SESSION_COOKIE } from "@/lib/sessions";
import { createUserProfile } from "@/lib/users";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

beforeEach(() => {
    vi.resetModules();
});

function makeRequest(
    method: string,
    url: string,
    opts: {
        cookieHeader?: string;
        body?: unknown;
    } = {},
): Request {
    const headers: Record<string, string> = {};
    if (opts.cookieHeader) headers.Cookie = opts.cookieHeader;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    return new Request(url, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
}

async function setupKvWithSession(kv: ReturnType<typeof createMockKv>) {
    vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);

    // Create a user profile
    await createUserProfile("user@example.com", { name: "Test User" });

    // Create a session
    const { session } = await createSession("user@example.com", new Request("https://example.com"));

    return session;
}

describe("GET /api/me", () => {
    it("returns the user profile when session is valid", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { GET } = await import("./route");
        const res = await GET(
            makeRequest("GET", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
            }),
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { email: string; name: string };
        expect(body.email).toBe("user@example.com");
        expect(body.name).toBe("Test User");
    });

    it("returns 401 when no session cookie", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const { GET } = await import("./route");
        const res = await GET(makeRequest("GET", "https://example.com/api/me"));
        expect(res.status).toBe(401);
    });

    it("returns 401 when session points to a deleted user", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        // Session exists but no user profile
        const { session } = await createSession("ghost@example.com", new Request("https://example.com"));

        const { GET } = await import("./route");
        const res = await GET(
            makeRequest("GET", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
            }),
        );
        expect(res.status).toBe(401);
    });
});

describe("PATCH /api/me", () => {
    it("updates name and returns merged profile", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            makeRequest("PATCH", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
                body: { name: "Updated Name" },
            }),
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { name: string };
        expect(body.name).toBe("Updated Name");
    });

    it("updates notifications settings", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            makeRequest("PATCH", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
                body: { notifications: { enabled: true, frequencyMinutes: 60 } },
            }),
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { notifications: { enabled: boolean; frequencyMinutes: number } };
        expect(body.notifications).toEqual({ enabled: true, frequencyMinutes: 60 });
    });

    it("returns 401 when no session", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(makeRequest("PATCH", "https://example.com/api/me", { body: { name: "x" } }));
        expect(res.status).toBe(401);
    });

    it("returns 400 on invalid JSON", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            new Request("https://example.com/api/me", {
                method: "PATCH",
                headers: {
                    Cookie: `${SESSION_COOKIE}=${session.id}`,
                    "Content-Type": "application/json",
                },
                body: "not json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when patch contains extra fields", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            makeRequest("PATCH", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
                body: { name: "x", email: "hacker@evil.com" },
            }),
        );
        expect(res.status).toBe(400);
    });

    it("accepts frequencyMinutes: 5", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            makeRequest("PATCH", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
                body: { notifications: { enabled: true, frequencyMinutes: 5 } },
            }),
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { notifications: { enabled: boolean; frequencyMinutes: number } };
        expect(body.notifications).toEqual({ enabled: true, frequencyMinutes: 5 });
    });

    it("returns 400 when frequencyMinutes is an invalid value", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { PATCH } = await import("./route");
        const res = await PATCH(
            makeRequest("PATCH", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
                body: { notifications: { enabled: true, frequencyMinutes: 99 } },
            }),
        );
        expect(res.status).toBe(400);
    });
});

describe("DELETE /api/me", () => {
    it("deletes the user and session, returns 204 with clearing cookie", async () => {
        const kv = createMockKv();
        const session = await setupKvWithSession(kv);

        const { DELETE } = await import("./route");
        const res = await DELETE(
            makeRequest("DELETE", "https://example.com/api/me", {
                cookieHeader: `${SESSION_COOKIE}=${session.id}`,
            }),
        );

        expect(res.status).toBe(204);

        // Profile should be gone
        const profile = await kv.get("user:user@example.com:profile");
        expect(profile).toBeNull();

        // Session should be gone
        const stored = await kv.get(`session:${session.id}`);
        expect(stored).toBeNull();

        // Clearing cookie present
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain(`${SESSION_COOKIE}=`);
        expect(setCookie).toContain("Max-Age=0");
    });

    it("returns 401 when no session", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const { DELETE } = await import("./route");
        const res = await DELETE(makeRequest("DELETE", "https://example.com/api/me"));
        expect(res.status).toBe(401);
    });
});
