import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";
import * as cloudflare from "./cloudflare";
import {
    SESSION_COOKIE,
    createSession,
    readSession,
    destroySession,
} from "./sessions";

beforeEach(() => {
    vi.resetModules();
});

function reqWithCookie(value: string | null) {
    const headers: Record<string, string> = {};
    if (value !== null) headers.Cookie = `${SESSION_COOKIE}=${value}; other=ignored`;
    return new Request("https://example.com/some-path", { headers });
}

describe("session storage", () => {
    it("createSession writes a Session to KV and returns a Set-Cookie value", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const { session, cookie } = await createSession(
            "user@example.com",
            new Request("https://example.com", { headers: { "User-Agent": "VitestRunner" } }),
        );

        expect(session.email).toBe("user@example.com");
        expect(session.id).toMatch(/^[a-f0-9]{64}$/);
        expect(session.userAgent).toBe("VitestRunner");
        expect(cookie).toContain(`${SESSION_COOKIE}=${session.id}`);
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie).toContain("Path=/");
        expect(cookie).toMatch(/Max-Age=\d+/);

        const stored = await kv.get(`session:${session.id}`, "json");
        expect(stored).toMatchObject({ email: "user@example.com", id: session.id });
    });

    it("readSession returns the session when the cookie is valid", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const { session } = await createSession("user@example.com", new Request("https://example.com"));
        const got = await readSession(reqWithCookie(session.id));
        expect(got?.email).toBe("user@example.com");
    });

    it("readSession returns null when there is no cookie", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());
        expect(await readSession(reqWithCookie(null))).toBeNull();
    });

    it("readSession returns null and deletes the KV entry when expired", async () => {
        const kv = createMockKv({
            "session:expired-id": JSON.stringify({
                id: "expired-id",
                email: "user@example.com",
                createdAt: "2024-01-01T00:00:00.000Z",
                expiresAt: "2024-01-02T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const got = await readSession(reqWithCookie("expired-id"));
        expect(got).toBeNull();
        expect(await kv.get("session:expired-id")).toBeNull();
    });

    it("readSession returns null when the cookie id has no KV entry", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());
        expect(await readSession(reqWithCookie("unknown-id"))).toBeNull();
    });

    it("destroySession deletes the KV entry and returns a clearing cookie", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const { session } = await createSession("user@example.com", new Request("https://example.com"));
        const { cookie } = await destroySession(reqWithCookie(session.id));

        expect(await kv.get(`session:${session.id}`)).toBeNull();
        expect(cookie).toContain(`${SESSION_COOKIE}=`);
        expect(cookie).toContain("Max-Age=0");
    });
});
