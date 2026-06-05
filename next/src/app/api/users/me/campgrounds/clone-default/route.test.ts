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

async function doPost(): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/users/me/campgrounds/clone-default", { method: "POST" }),
    );
}

describe("POST /api/users/me/campgrounds/clone-default", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doPost();
        expect(res.status).toBe(401);
    });

    it("clones the curated default from KV when available", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });

        const curatedDefault = {
            campgrounds: {
                "recreation.gov": [
                    { id: "777", name: "Curated Camp", sites: { favorites: ["A"], worthwhile: [] } },
                ],
            },
            globalSettings: { stayLengths: [3, 4], validStartDays: ["Friday", "Saturday"] },
        };

        const kv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: curatedDefault.campgrounds,
                globalSettings: curatedDefault.globalSettings,
                updatedAt: "2024-01-02",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(cloudflare.getEnv).mockReturnValue({
            BOOTSTRAP_ADMIN_EMAIL: "boss@example.com",
            SUBSCRIBERS: kv,
        } as never);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as typeof curatedDefault & { updatedAt: string };
        expect(body.campgrounds).toEqual(curatedDefault.campgrounds);
        expect(body.globalSettings).toEqual(curatedDefault.globalSettings);
        expect(typeof body.updatedAt).toBe("string");

        // User's record should now be stored in KV
        const stored = (await kv.get("user:user@example.com:campgrounds", "json")) as typeof body;
        expect(stored.campgrounds).toEqual(curatedDefault.campgrounds);
        expect(stored.globalSettings).toEqual(curatedDefault.globalSettings);
    });

    it("falls back to static defaults when KV config is empty", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });

        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(cloudflare.getEnv).mockReturnValue({
            BOOTSTRAP_ADMIN_EMAIL: "boss@example.com",
            SUBSCRIBERS: kv,
        } as never);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            campgrounds: { "recreation.gov": unknown[] };
            globalSettings: { stayLengths: number[]; validStartDays: string[] };
            updatedAt: string;
        };

        // Static defaults should have campgrounds (from the in-repo catalog fallback)
        expect(Array.isArray(body.campgrounds["recreation.gov"])).toBe(true);
        expect(body.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
        // globalSettings should have the sitewide defaults
        expect(Array.isArray(body.globalSettings.stayLengths)).toBe(true);
        expect(Array.isArray(body.globalSettings.validStartDays)).toBe(true);
        expect(typeof body.updatedAt).toBe("string");
    });
});
