// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import { __setEnvForTests, type CampWatchEnv } from "@/lib/cloudflare";
import { generateUnsubscribeToken } from "@/lib/hmac";
import { GET, POST } from "./route";

const SECRET = "unit-test-api-secret";

afterEach(() => {
    __setEnvForTests(undefined);
});

function setEnv(opts: { kv?: ReturnType<typeof createMockKv>; apiSecret?: string | undefined } = {}) {
    const kv = opts.kv ?? createMockKv();
    const apiSecret = "apiSecret" in opts ? opts.apiSecret : SECRET;
    __setEnvForTests({ SUBSCRIBERS: kv, API_SECRET: apiSecret } as CampWatchEnv);
    return kv;
}

function req(method: "GET" | "POST", query: Record<string, string>): Request {
    const url = new URL("https://example.com/api/unsubscribe");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return new Request(url, { method });
}

describe("GET /api/unsubscribe", () => {
    it("renders a confirmation form when the token is valid (does not delete)", async () => {
        const email = "user@example.com";
        const kv = setEnv({
            kv: createMockKv({ [`user:${email}:profile`]: JSON.stringify({ email, name: "X" }) }),
        });
        const token = await generateUnsubscribeToken(email, SECRET);

        const res = await GET(req("GET", { email, token }));

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/html");
        const html = await res.text();
        expect(html).toContain(email);
        expect(html).toMatch(/<form[^>]*method="POST"/);
        expect(html).toContain("Yes, unsubscribe me");
        expect(await kv.get(`user:${email}:profile`)).not.toBeNull();
    });

    it("returns 400 when email or token is missing", async () => {
        setEnv();
        const res = await GET(req("GET", { email: "user@example.com" }));
        expect(res.status).toBe(400);
    });

    it("returns 403 when the token does not match", async () => {
        setEnv();
        const res = await GET(req("GET", { email: "user@example.com", token: "deadbeef" }));
        expect(res.status).toBe(403);
    });

    it("returns 500 when API_SECRET is not configured", async () => {
        setEnv({ apiSecret: undefined });
        const res = await GET(req("GET", { email: "user@example.com", token: "anything" }));
        expect(res.status).toBe(500);
    });
});

describe("POST /api/unsubscribe", () => {
    it("deletes the user profile and confirms when the token is valid", async () => {
        const email = "user@example.com";
        const kv = setEnv({
            kv: createMockKv({ [`user:${email}:profile`]: JSON.stringify({ email, name: "X" }) }),
        });
        const token = await generateUnsubscribeToken(email, SECRET);

        const res = await POST(req("POST", { email, token }));

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(email);
        expect(html).toMatch(/unsubscribed/i);
        expect(await kv.get(`user:${email}:profile`)).toBeNull();
    });

    it("returns 403 when the token does not match", async () => {
        setEnv();
        const res = await POST(req("POST", { email: "user@example.com", token: "deadbeef" }));
        expect(res.status).toBe(403);
    });

    it("returns 400 when email is missing", async () => {
        setEnv();
        const res = await POST(req("POST", { token: "anything" }));
        expect(res.status).toBe(400);
    });

    it("is idempotent — succeeds even if the user doesn't exist", async () => {
        const email = "ghost@example.com";
        setEnv();
        const token = await generateUnsubscribeToken(email, SECRET);

        const res = await POST(req("POST", { email, token }));

        expect(res.status).toBe(200);
    });
});
