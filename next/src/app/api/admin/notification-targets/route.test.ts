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
    return GET(new Request("https://example.com/api/admin/notification-targets", { headers }));
}

describe("GET /api/admin/notification-targets", () => {
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

    it("excludes users with empty campground lists; sorts by email", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:bob@x.com:profile": JSON.stringify({
                email: "bob@x.com",
                name: "Bob",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:bob@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "1", name: "X", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
            "user:alice@x.com:profile": JSON.stringify({
                email: "alice@x.com",
                name: "Alice",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            // alice has no campgrounds → excluded
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { targets: Array<{ email: string }> };
        expect(body.targets.map((t) => t.email)).toEqual(["bob@x.com"]);
    });

    it("synthesizes default notifications when profile has none", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({
                email: "user@x.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:user@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "1", name: "X", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get(`Bearer ${SECRET}`);
        const body = (await res.json()) as { targets: Array<{ notifications: { enabled: boolean; frequencyMinutes: number } }> };
        expect(body.targets[0].notifications).toEqual({ enabled: true, frequencyMinutes: 15 });
    });

    it("includes notifierState from KV when present", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({
                email: "user@x.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
                lastNotifiedAt: "2026-05-15T01:00:00.000Z",
            }),
            "user:user@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "1", name: "X", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
            "user:user@x.com:notifier-state": JSON.stringify({ signatures: ["a", "b"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get(`Bearer ${SECRET}`);
        const body = (await res.json()) as {
            targets: Array<{ notifierState: unknown; lastNotifiedAt?: string }>;
        };
        expect(body.targets[0].notifierState).toEqual({ signatures: ["a", "b"] });
        expect(body.targets[0].lastNotifiedAt).toBe("2026-05-15T01:00:00.000Z");
    });

    it("includes roles in each target", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({
                email: "curator@x.com",
                name: "Curator",
                roles: ["curator"],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:curator@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "1", name: "X", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { targets: Array<{ roles: string[] }> };
        expect(body.targets[0].roles).toEqual(["curator"]);
    });

    it("returns notifierState: null when no state has been stored", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({
                email: "user@x.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:user@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [{ id: "1", name: "X", sites: { favorites: [], worthwhile: [] } }] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
                updatedAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get(`Bearer ${SECRET}`);
        const body = (await res.json()) as { targets: Array<{ notifierState: unknown }> };
        expect(body.targets[0].notifierState).toBeNull();
    });
});
