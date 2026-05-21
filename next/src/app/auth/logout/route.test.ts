import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import * as cloudflare from "@/lib/cloudflare";
import { createSession, SESSION_COOKIE } from "@/lib/sessions";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

beforeEach(() => {
    vi.resetModules();
});

async function callLogout(cookieHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (cookieHeader) headers.Cookie = cookieHeader;
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/auth/logout", {
            method: "POST",
            headers,
        }),
    );
}

describe("POST /auth/logout", () => {
    it("deletes the session from KV and sets a clearing cookie", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        // Create a real session first
        const { session } = await createSession("user@example.com", new Request("https://example.com"));

        const res = await callLogout(`${SESSION_COOKIE}=${session.id}`);

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://example.com/");

        // Session should be deleted
        const stored = await kv.get(`session:${session.id}`);
        expect(stored).toBeNull();

        // Clearing cookie present
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain(`${SESSION_COOKIE}=`);
        expect(setCookie).toContain("Max-Age=0");
    });

    it("still returns 302 with a clearing cookie even when no session cookie is present", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await callLogout();

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://example.com/");
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain("Max-Age=0");
    });

    it("redirects to the origin root, not a relative path", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getEnv).mockReturnValue({ SUBSCRIBERS: kv } as cloudflare.CampWatchEnv);
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const { POST } = await import("./route");
        const res = await POST(
            new Request("https://campwatch.dev/auth/logout", {
                method: "POST",
            }),
        );

        expect(res.headers.get("Location")).toBe("https://campwatch.dev/");
    });
});
