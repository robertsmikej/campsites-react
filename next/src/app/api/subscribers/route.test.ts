import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

const SECRET = "unit-test-api-secret";

beforeEach(() => {
    vi.resetModules();
});

async function get(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/subscribers", { headers }));
}

describe("GET /api/subscribers", () => {
    it("returns 401 when Authorization header is missing", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get();
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 401 when token does not match API_SECRET", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            API_SECRET: SECRET,
        });

        const res = await get("Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("returns the list of subscriber emails", async () => {
        const kv = createMockKv({
            "email:a@x.com": JSON.stringify({ email: "a@x.com" }),
            "email:b@x.com": JSON.stringify({ email: "b@x.com" }),
            "config:default": "{}",
        });
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: kv,
            API_SECRET: SECRET,
        });

        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ subscribers: ["a@x.com", "b@x.com"] });
    });
});
