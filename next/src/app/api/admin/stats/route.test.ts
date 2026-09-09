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
const KEY = "notifier:stats";

const STORED = {
    lastPollAt: "2026-09-09T12:00:00.000Z",
    campgroundsTracked: 4,
    openingsSentToday: 2,
    openingsSentLast7Days: 11,
    medianLatencyMs: 9000,
    sampleSize: 6,
    todayKey: "2026-09-09",
    _latencyWindow: [8000, 9000, 10000],
    _dailyHistory: [
        { date: "2026-09-08", count: 9 },
        { date: "2026-09-09", count: 2 },
    ],
};

async function get(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/admin/stats", { method: "GET", headers }));
}

async function put(body: unknown, authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/admin/stats", {
            method: "PUT",
            headers,
            body: JSON.stringify(body),
        }),
    );
}

describe("GET /api/admin/stats", () => {
    it("returns 401 without a Bearer header", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv({ [KEY]: JSON.stringify(STORED) }));
        const res = await get();
        expect(res.status).toBe(401);
    });

    it("returns 401 with the wrong Bearer value", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv({ [KEY]: JSON.stringify(STORED) }));
        const res = await get("Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("returns the full stored blob including the underscore fields", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv({ [KEY]: JSON.stringify(STORED) }));
        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as typeof STORED;
        expect(body).toEqual(STORED);
        expect(body._latencyWindow).toEqual([8000, 9000, 10000]);
        expect(body._dailyHistory).toHaveLength(2);
    });

    it("returns null when nothing has been stored yet", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        expect(await res.json()).toBeNull();
    });

    it("reads back exactly what PUT wrote, under the same KV key", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const putRes = await put(STORED, `Bearer ${SECRET}`);
        expect(putRes.status).toBe(200);
        expect(kv._store.has(KEY)).toBe(true);

        const res = await get(`Bearer ${SECRET}`);
        const body = (await res.json()) as typeof STORED;
        expect(body).toEqual(STORED);
    });
});

describe("PUT /api/admin/stats", () => {
    it("returns 401 without a Bearer header", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put(STORED);
        expect(res.status).toBe(401);
    });

    it("returns 400 for an invalid JSON body", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const { PUT } = await import("./route");
        const res = await PUT(
            new Request("https://example.com/api/admin/stats", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
                body: "not-json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("persists the underscore fields alongside the public ones", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put(STORED, `Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const stored = (await kv.get(KEY, "json")) as typeof STORED;
        expect(stored._latencyWindow).toEqual(STORED._latencyWindow);
        expect(stored._dailyHistory).toEqual(STORED._dailyHistory);
    });
});
