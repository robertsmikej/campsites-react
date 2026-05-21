// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";
import { __setEnvForTests, type CampWatchEnv } from "./cloudflare";
import { SESSION_COOKIE, createSession, readSession, destroySession } from "./sessions";

afterEach(() => {
    __setEnvForTests(undefined);
});

function reqWithCookie(value: string | null) {
    const headers: Record<string, string> = {};
    if (value !== null) headers.Cookie = `${SESSION_COOKIE}=${value}; other=ignored`;
    return new Request("https://example.com/some-path", { headers });
}

function setEnv(overrides: Partial<CampWatchEnv> = {}, kv = createMockKv()) {
    const env = { SUBSCRIBERS: kv, ...overrides } as unknown as CampWatchEnv;
    __setEnvForTests(env);
    return { kv, env };
}

describe("session storage", () => {
    it("createSession writes a Session to KV and returns a Set-Cookie value", async () => {
        const { kv } = setEnv();

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
        setEnv();

        const { session } = await createSession("user@example.com", new Request("https://example.com"));
        const got = await readSession(reqWithCookie(session.id));
        expect(got?.email).toBe("user@example.com");
    });

    it("readSession returns null when there is no cookie", async () => {
        setEnv();
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
        setEnv({}, kv);

        const got = await readSession(reqWithCookie("expired-id"));
        expect(got).toBeNull();
        expect(await kv.get("session:expired-id")).toBeNull();
    });

    it("readSession returns null when the cookie id has no KV entry", async () => {
        setEnv();
        expect(await readSession(reqWithCookie("unknown-id"))).toBeNull();
    });

    it("destroySession deletes the KV entry and returns a clearing cookie", async () => {
        const { kv } = setEnv();

        const { session } = await createSession("user@example.com", new Request("https://example.com"));
        const { cookie } = await destroySession(reqWithCookie(session.id));

        expect(await kv.get(`session:${session.id}`)).toBeNull();
        expect(cookie).toContain(`${SESSION_COOKIE}=`);
        expect(cookie).toContain("Max-Age=0");
    });
});

describe("dev bypass", () => {
    it("returns null when DEV_USER is unset and there is no cookie", async () => {
        setEnv({ DEV_USER: undefined });
        expect(await readSession(reqWithCookie(null))).toBeNull();
    });

    it("returns a synthetic session when DEV_USER is set and there is no cookie", async () => {
        setEnv({ DEV_USER: "dev@example.com" });
        const session = await readSession(reqWithCookie(null));
        expect(session).not.toBeNull();
        expect(session?.email).toBe("dev@example.com");
        expect(session?.id).toBe("dev:dev@example.com");
        expect(new Date(session!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("creates the user profile in KV on first dev request", async () => {
        const { kv } = setEnv({ DEV_USER: "new@example.com" });
        await readSession(reqWithCookie(null));
        const stored = (await kv.get("user:new@example.com:profile", "json")) as { email: string } | null;
        expect(stored?.email).toBe("new@example.com");
    });

    it("does not write the synthetic session to KV", async () => {
        const { kv } = setEnv({ DEV_USER: "dev@example.com" });
        await readSession(reqWithCookie(null));
        const sessionKey = await kv.get("session:dev:dev@example.com");
        expect(sessionKey).toBeNull();
    });

    it("grants curator role when DEV_USER matches BOOTSTRAP_ADMIN_EMAIL", async () => {
        const { kv } = setEnv({
            DEV_USER: "admin@example.com",
            BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
        });
        await readSession(reqWithCookie(null));
        const profile = (await kv.get("user:admin@example.com:profile", "json")) as {
            roles: string[];
        } | null;
        expect(profile?.roles).toContain("curator");
    });

    it("returns null when NODE_ENV is production even if DEV_USER is set", async () => {
        setEnv({ DEV_USER: "dev@example.com" });
        vi.stubEnv("NODE_ENV", "production");
        const session = await readSession(reqWithCookie(null));
        vi.unstubAllEnvs();
        expect(session).toBeNull();
    });
});
