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

import * as cloudflare from "@/lib/cloudflare";
import * as sessions from "@/lib/sessions";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

const CAMPGROUND_A = {
    id: "campground-a",
    name: "Campground A",
    sites: { favorites: [], worthwhile: [] },
};

const CAMPGROUND_B = {
    id: "campground-b",
    name: "Campground B",
    sites: { favorites: [], worthwhile: [] },
};

const DEFAULT_CONFIG = {
    campgrounds: {
        "recreation.gov": [CAMPGROUND_A, CAMPGROUND_B],
    },
    globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday", "Saturday"] },
};

async function post(body: unknown): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/users/me/campgrounds/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

async function postRaw(rawBody: string): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/users/me/campgrounds/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
        }),
    );
}

describe("POST /api/users/me/campgrounds/items", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await post({ id: "campground-a" });
        expect(res.status).toBe(401);
    });

    it("returns 400 on invalid JSON", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await postRaw("not-json{{{");
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Invalid JSON");
    });

    it("returns 400 when id is missing", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await post({});
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("id");
    });

    it("returns 400 when id is empty string", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await post({ id: "" });
        expect(res.status).toBe(400);
    });

    it("returns 404 when KV has no default config", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await post({ id: "campground-a" });
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("No default config to copy from");
    });

    it("returns 404 when campground id is not in the default list", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(DEFAULT_CONFIG),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await post({ id: "nonexistent-id" });
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Campground not in default list");
    });

    it("appends the campground to an empty user list and returns the stored record", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(DEFAULT_CONFIG),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post({ id: "campground-a" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            campgrounds: { "recreation.gov": typeof CAMPGROUND_A[] };
            updatedAt: string;
        };
        expect(body.campgrounds["recreation.gov"]).toHaveLength(1);
        expect(body.campgrounds["recreation.gov"][0].id).toBe("campground-a");
        expect(typeof body.updatedAt).toBe("string");

        // Verify it was persisted in KV
        const stored = await kv.get("user:user@x.com:campgrounds", "json") as { campgrounds: { "recreation.gov": unknown[] } };
        expect(stored.campgrounds["recreation.gov"]).toHaveLength(1);
    });

    it("appends the campground to a user list that already has another entry", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        const existingRecord = {
            campgrounds: { "recreation.gov": [CAMPGROUND_A] },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: "2026-01-01T00:00:00.000Z",
        };
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(DEFAULT_CONFIG),
            "user:user@x.com:campgrounds": JSON.stringify(existingRecord),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post({ id: "campground-b" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: { "recreation.gov": Array<{ id: string }> } };
        expect(body.campgrounds["recreation.gov"].map((c) => c.id)).toEqual([
            "campground-a",
            "campground-b",
        ]);
    });

    it("returns 200 with 'Already in your list' when user already has the campground", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        const existingRecord = {
            campgrounds: { "recreation.gov": [CAMPGROUND_A] },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: "2026-01-01T00:00:00.000Z",
        };
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(DEFAULT_CONFIG),
            "user:user@x.com:campgrounds": JSON.stringify(existingRecord),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post({ id: "campground-a" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            message: string;
            campgrounds: { "recreation.gov": Array<{ id: string }> };
            updatedAt: string;
        };
        expect(body.message).toBe("Already in your list");
        // List should be unchanged (still only one entry)
        expect(body.campgrounds["recreation.gov"]).toHaveLength(1);
        // KV should not have been written again
        const stored = await kv.get("user:user@x.com:campgrounds", "json") as { updatedAt: string };
        expect(stored.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    });
});
