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

vi.mock("@/lib/users", () => ({
    getUserProfile: vi.fn(),
}));

import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";
import * as users from "@/lib/users";

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

    it("returns 200 with stored record on valid body (non-curator)", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "user@example.com",
            name: "User",
            roles: [],
            createdAt: "x",
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

        // User KV record should be written.
        const raw = await kv.get("user:user@example.com:campgrounds");
        expect(JSON.parse(raw as string)).toEqual(body);

        // Default config should NOT be touched for a non-curator.
        const defaultRaw = await kv.get("config:campgrounds");
        expect(defaultRaw).toBeNull();
    });

    it("non-curator PUT updates user record and leaves default untouched", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "regular@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "regular@example.com",
            name: "Regular User",
            roles: [],
            createdAt: "x",
        });
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "old", name: "Old Camp", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const payload = {
            campgrounds: { "recreation.gov": [{ id: "new", name: "New Camp", sites: { favorites: [], worthwhile: [] } }] },
            globalSettings: { stayLengths: [3], validStartDays: ["Saturday"] },
        };

        const res = await doPut(payload);
        expect(res.status).toBe(200);

        // User record is updated.
        const userRaw = await kv.get("user:regular@example.com:campgrounds");
        expect(JSON.parse(userRaw as string).campgrounds["recreation.gov"][0].id).toBe("new");

        // Default config is unchanged.
        const defaultRaw = await kv.get("config:campgrounds");
        expect(JSON.parse(defaultRaw as string).campgrounds["recreation.gov"][0].id).toBe("old");
    });

    it("curator PUT updates user record AND writes through to default config", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "curator@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "curator@example.com",
            name: "Curator",
            roles: ["curator"],
            createdAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const payload = {
            campgrounds: { "recreation.gov": [{ id: "232312", name: "Pine Flats", sites: { favorites: [], worthwhile: [] } }] },
            globalSettings: { stayLengths: [2, 3, 4], validStartDays: ["Friday", "Saturday", "Sunday"] },
        };

        const res = await doPut(payload);
        expect(res.status).toBe(200);

        // User record is updated.
        const userRaw = await kv.get("user:curator@example.com:campgrounds");
        expect(JSON.parse(userRaw as string).campgrounds["recreation.gov"][0].id).toBe("232312");

        // Default config is also written with the same campgrounds + globalSettings.
        const defaultRaw = await kv.get("config:campgrounds");
        expect(defaultRaw).not.toBeNull();
        const defaultParsed = JSON.parse(defaultRaw as string) as {
            campgrounds: { "recreation.gov": { id: string }[] };
            globalSettings: { stayLengths: number[] };
        };
        expect(defaultParsed.campgrounds["recreation.gov"][0].id).toBe("232312");
        expect(defaultParsed.globalSettings.stayLengths).toEqual([2, 3, 4]);
    });
});
