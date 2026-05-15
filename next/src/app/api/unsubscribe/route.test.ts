import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";
import { generateUnsubscribeToken } from "@/lib/hmac";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

const SECRET = "unit-test-api-secret";

beforeEach(() => {
    vi.resetModules();
});

async function get(query: Record<string, string>): Promise<Response> {
    const url = new URL("https://example.com/api/unsubscribe");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const { GET } = await import("./route");
    return GET(new Request(url));
}

describe("GET /api/unsubscribe", () => {
    it("removes the email and returns an HTML confirmation when the token is valid", async () => {
        const email = "user@example.com";
        const kv = createMockKv({ [`email:${email}`]: JSON.stringify({ email }) });
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: kv,
            API_SECRET: SECRET,
        });

        const token = await generateUnsubscribeToken(email, SECRET);
        const res = await get({ email, token });

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/html");
        const html = await res.text();
        expect(html).toContain(email);
        expect(html).toContain("Unsubscribed");
        expect(await kv.get(`email:${email}`)).toBeNull();
    });

    it("returns 400 when email or token is missing", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get({ email: "user@example.com" });
        expect(res.status).toBe(400);
        expect(await res.text()).toContain("Missing email or token");
    });

    it("returns 403 when the token does not match", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get({ email: "user@example.com", token: "deadbeef" });
        expect(res.status).toBe(403);
    });

    it("returns 500 when API_SECRET is not configured", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
        });

        const res = await get({ email: "user@example.com", token: "anything" });
        expect(res.status).toBe(500);
    });
});
