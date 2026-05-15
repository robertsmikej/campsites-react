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
    return GET();
}

async function doPut(body: unknown): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/default", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

describe("GET /api/default", () => {
    it("returns 404 when KV is empty", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await doGet();
        expect(res.status).toBe(404);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("No default config found");
    });

    it("returns 200 with the stored config", async () => {
        const config = {
            campgrounds: {
                "recreation.gov": [
                    { id: "123", name: "My Camp", sites: { favorites: [], worthwhile: [] } },
                ],
            },
            globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
        };
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(config),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await doGet();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(config);
    });
});

describe("PUT /api/default", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await doPut({ campgrounds: { "recreation.gov": [] } });
        expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "user@example.com",
            name: "User",
            roles: [],
            createdAt: "x",
        });

        const res = await doPut({ campgrounds: { "recreation.gov": [] } });
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Forbidden");
    });

    it("returns 403 when user profile does not exist", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "ghost@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(users.getUserProfile).mockResolvedValue(null);

        const res = await doPut({ campgrounds: { "recreation.gov": [] } });
        expect(res.status).toBe(403);
    });

    it("returns 400 when campgrounds field is missing", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "curator@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "curator@example.com",
            name: "Curator",
            roles: ["curator"],
            createdAt: "x",
        });

        const res = await doPut({ globalSettings: { stayLengths: [2], validStartDays: [] } });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("campgrounds");
    });

    it("returns 200 and stores config in KV for a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "curator@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(users.getUserProfile).mockResolvedValue({
            email: "curator@example.com",
            name: "Curator",
            roles: ["curator"],
            createdAt: "x",
        });

        const payload = {
            campgrounds: {
                "recreation.gov": [
                    { id: "999", name: "Curated", sites: { favorites: [], worthwhile: [] } },
                ],
            },
            globalSettings: { stayLengths: [3, 4], validStartDays: ["Saturday"] },
        };

        const res = await doPut(payload);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { message: string };
        expect(body.message).toBe("Default config saved");

        // KV should contain the written config
        const stored = await kv.get("config:campgrounds", "json");
        expect(stored).toEqual(payload);
    });
});
