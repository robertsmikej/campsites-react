import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

const SECRET = "unit-test-api-secret";
const CONFIG_KEY = "unit-test-config-key";

beforeEach(() => {
    vi.resetModules();
});

async function getConfig(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/config", { headers }));
}

async function putConfig(body: unknown, authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/config", {
            method: "PUT",
            headers,
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );
}

describe("GET /api/config", () => {
    it("returns the saved config", async () => {
        const config = { campgrounds: { "recreation.gov": [] }, globalSettings: {} };
        const kv = createMockKv({ "config:campgrounds": JSON.stringify(config) });
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({ SUBSCRIBERS: kv });

        const res = await getConfig();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(config);
    });

    it("returns 404 when nothing is saved", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
        });

        const res = await getConfig();
        expect(res.status).toBe(404);
    });

    it("requires Bearer auth when CONFIG_KEY is set; accepts CONFIG_KEY or API_SECRET", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({ campgrounds: {} }),
        });
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: kv,
            CONFIG_KEY,
            API_SECRET: SECRET,
        });

        expect((await getConfig()).status).toBe(401);
        expect((await getConfig(`Bearer wrong`)).status).toBe(401);
        expect((await getConfig(`Bearer ${CONFIG_KEY}`)).status).toBe(200);
        expect((await getConfig(`Bearer ${SECRET}`)).status).toBe(200);
    });
});

describe("PUT /api/config", () => {
    it("saves a valid config", async () => {
        const kv = createMockKv();
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({ SUBSCRIBERS: kv });

        const body = { campgrounds: { "recreation.gov": [] }, globalSettings: {} };
        const res = await putConfig(body);

        expect(res.status).toBe(200);
        expect(await kv.get("config:campgrounds", "json")).toEqual(body);
    });

    it("rejects invalid JSON", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({ SUBSCRIBERS: createMockKv() });

        const res = await putConfig("not json");
        expect(res.status).toBe(400);
    });

    it("rejects a body missing `campgrounds`", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({ SUBSCRIBERS: createMockKv() });

        const res = await putConfig({ globalSettings: {} });
        expect(res.status).toBe(400);
    });

    it("requires CONFIG_KEY auth when CONFIG_KEY is set", async () => {
        const { getEnv } = await import("@/lib/cloudflare");
        vi.mocked(getEnv).mockReturnValue({
            SUBSCRIBERS: createMockKv(),
            CONFIG_KEY,
        });

        const body = { campgrounds: {} };
        expect((await putConfig(body)).status).toBe(401);
        expect((await putConfig(body, `Bearer wrong`)).status).toBe(401);
        expect((await putConfig(body, `Bearer ${CONFIG_KEY}`)).status).toBe(200);
    });
});
