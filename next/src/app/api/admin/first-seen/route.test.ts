import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

const SECRET = "test-api-secret";

async function get(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/admin/first-seen", { headers }));
}

async function put(body?: unknown, authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/admin/first-seen", {
            method: "PUT",
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
    );
}

describe("GET /api/admin/first-seen", () => {
    it("returns 500 when API_SECRET is unset", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({} as never);
        const res = await get();
        expect(res.status).toBe(500);
    });

    it("returns 401 with no Bearer header", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get()).status).toBe(401);
    });

    it("returns 401 with wrong Bearer value", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get("Bearer wrong")).status).toBe(401);
    });

    it("returns empty object when no map stored", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({});
    });

    it("returns stored map when present", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const map = { "cg1:site1:2026-06-01:2026-06-03:2": "2026-05-01T00:00:00.000Z" };
        const kv = createMockKv({ "notifier:first-seen": JSON.stringify(map) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual(map);
    });
});

describe("PUT /api/admin/first-seen", () => {
    it("returns 500 when API_SECRET is unset", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({} as never);
        const res = await put({ map: {} });
        expect(res.status).toBe(500);
    });

    it("returns 401 with no Bearer header", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ map: {} });
        expect(res.status).toBe(401);
    });

    it("returns 401 with wrong Bearer value", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ map: {} }, "Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("returns 400 for invalid JSON body", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const { PUT } = await import("./route");
        const res = await PUT(
            new Request("https://example.com/api/admin/first-seen", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
                body: "not-json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when body has no map property", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ foo: "bar" }, `Bearer ${SECRET}`);
        expect(res.status).toBe(400);
    });

    it("returns 400 when map values are not strings", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ map: { sig1: 12345 } }, `Bearer ${SECRET}`);
        expect(res.status).toBe(400);
    });

    it("stores the map verbatim and returns ok", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const map = {
            "cg1:site1:2026-06-01:2026-06-03:2": "2026-05-01T00:00:00.000Z",
            "cg2:site2:2026-07-04:2026-07-07:3": "2026-05-02T10:00:00.000Z",
        };
        const res = await put({ map }, `Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok: boolean };
        expect(body.ok).toBe(true);

        const stored = await kv.get("notifier:first-seen", "json");
        expect(stored).toEqual(map);
    });

    it("replaces existing map verbatim (no merge)", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "notifier:first-seen": JSON.stringify({ oldSig: "2026-01-01T00:00:00.000Z" }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const newMap = { newSig: "2026-05-19T00:00:00.000Z" };
        await put({ map: newMap }, `Bearer ${SECRET}`);

        const stored = await kv.get("notifier:first-seen", "json");
        expect(stored).toEqual(newMap);
        expect((stored as Record<string, string>)["oldSig"]).toBeUndefined();
    });
});
