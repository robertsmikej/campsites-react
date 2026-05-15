import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

vi.mock("@/lib/sessions", () => ({
    readSession: vi.fn(),
    SESSION_COOKIE: "campwatch_session",
}));

import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/users/me/campgrounds"));
}

async function doPut(body: unknown): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/users/me/campgrounds", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

async function doPutRaw(rawBody: string): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/users/me/campgrounds", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
        }),
    );
}

describe("GET /api/users/me/campgrounds", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doGet();
        expect(res.status).toBe(401);
    });

    it("returns an empty record shape for a fresh user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            campgrounds: { "recreation.gov": unknown[] };
            updatedAt: null;
        };
        expect(body.campgrounds["recreation.gov"]).toEqual([]);
        expect(body.updatedAt).toBeNull();
    });

    it("returns the stored record for a returning user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const stored = {
            campgrounds: {
                "recreation.gov": [
                    { id: "1", name: "X", sites: { favorites: [], worthwhile: [] } },
                ],
            },
            globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
            updatedAt: "2026-05-15T00:00:00.000Z",
        };
        const kv = createMockKv({
            "user:user@example.com:campgrounds": JSON.stringify(stored),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await doGet();
        expect(await res.json()).toEqual(stored);
    });
});

describe("PUT /api/users/me/campgrounds", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doPut({
            campgrounds: { "recreation.gov": [] },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        });
        expect(res.status).toBe(401);
    });

    it("returns 400 on invalid JSON", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await doPutRaw("not-json{{{");
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Invalid JSON");
    });

    it("returns 400 when campgrounds is missing", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await doPut({
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("campgrounds");
    });

    it("returns 400 when globalSettings is missing", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await doPut({
            campgrounds: { "recreation.gov": [] },
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("globalSettings");
    });

    it("returns 200 with stored record on valid body", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const payload = {
            campgrounds: { "recreation.gov": [{ id: "1", name: "Test", sites: { favorites: [], worthwhile: [] } }] },
            globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday", "Saturday"] },
        };

        const res = await doPut(payload);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: typeof payload.campgrounds; globalSettings: typeof payload.globalSettings; updatedAt: string };
        expect(body.campgrounds).toEqual(payload.campgrounds);
        expect(body.globalSettings).toEqual(payload.globalSettings);
        expect(typeof body.updatedAt).toBe("string");

        // KV should match
        const raw = await kv.get("user:user@example.com:campgrounds");
        expect(JSON.parse(raw as string)).toEqual(body);
    });
});
