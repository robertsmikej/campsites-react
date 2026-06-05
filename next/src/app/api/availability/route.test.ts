import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";
import * as userCampgrounds from "@/lib/user-campgrounds";

vi.mock("@/lib/sessions");
vi.mock("@/lib/cloudflare");
vi.mock("@/lib/user-campgrounds");

function createMockKv(seed: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(seed));
    return {
        get: vi.fn(async (key: string, type?: string) => {
            const v = store.get(key);
            if (v === undefined) return null;
            return type === "json" ? JSON.parse(v) : v;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        _store: store,
    };
}

describe("GET /api/availability", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    let kv: ReturnType<typeof createMockKv>;

    beforeEach(() => {
        vi.clearAllMocks();
        fetchSpy = vi.spyOn(globalThis, "fetch");
        kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv as never);
    });

    it("returns snapshot from KV when present for logged-in user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        const snapshot = { updatedAt: "2026-05-28T00:00:00Z", campgrounds: [] };
        kv._store.set("snapshot:alice@example.com", JSON.stringify(snapshot));

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(snapshot);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("falls back to live fetch when no snapshot exists (logged-in)", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Test CG",
                        enabled: true,
                        dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: "2026-05-01T00:00:00Z",
        } as never);
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } },
                }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = (await response.json()) as { campgrounds: unknown[] };
        expect(body.campgrounds).toHaveLength(1);
        expect(fetchSpy).toHaveBeenCalled();
    });

    it("anonymous request uses curated default config", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const cfg = {
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Default CG",
                        enabled: true,
                        dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        };
        const anonKv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                name: "Boss",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: cfg.campgrounds,
                globalSettings: cfg.globalSettings,
                updatedAt: "2024-01-02",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(anonKv as never);
        vi.mocked(cloudflare.getEnv).mockReturnValue({ BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", SUBSCRIBERS: anonKv } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: cfg.campgrounds,
            globalSettings: cfg.globalSettings,
            updatedAt: "2024-01-02",
        } as never);
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ campsites: {} }), { status: 200 }));

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = (await response.json()) as { campgrounds: { id: string }[] };
        expect(body.campgrounds).toHaveLength(1);
        expect(body.campgrounds[0]?.id).toBe("232358");
    });

    it("writes snapshot after live fetch (logged-in only)", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({ email: "alice@example.com" } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: { "recreation.gov": [] },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            updatedAt: null,
        } as never);

        await GET(new Request("http://x/api/availability"));
        expect(kv.put).toHaveBeenCalledWith(
            "snapshot:alice@example.com",
            expect.any(String),
            expect.objectContaining({ expirationTtl: 600 }),
        );
    });

    it("sets totalSitesCount > 0 and empty sites map when all sites have no matches", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const cfg = {
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "No Match CG",
                        enabled: true,
                        dates: { startDate: "2026-07-01", endDate: "2026-07-03" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
        };
        const anonKv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                name: "Boss",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: cfg.campgrounds,
                globalSettings: cfg.globalSettings,
                updatedAt: "2024-01-02",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(anonKv as never);
        vi.mocked(cloudflare.getEnv).mockReturnValue({ BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", SUBSCRIBERS: anonKv } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: cfg.campgrounds,
            globalSettings: cfg.globalSettings,
            updatedAt: "2024-01-02",
        } as never);
        // One site with no available dates → matches will be empty after processing.
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: {
                        "1": { site: "001", campsite_type: "STANDARD", availabilities: {} },
                    },
                }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        const body = (await response.json()) as {
            campgrounds: Array<{ siteAvailability: Record<string, unknown>; totalSitesCount: number }>;
        };
        expect(body.campgrounds).toHaveLength(1);
        const cg = body.campgrounds[0]!;
        expect(cg.totalSitesCount).toBe(1);
        expect(Object.keys(cg.siteAvailability)).toHaveLength(0);
    });

    it("filters out empty-match sites but keeps sites with matches; totalSitesCount reflects original total", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const cfg = {
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232358",
                        name: "Mixed CG",
                        enabled: true,
                        // Two-month window that includes our test date (2026-07-04 is a Saturday).
                        dates: { startDate: "2026-07-01", endDate: "2026-07-10" },
                        sites: { favorites: [], worthwhile: [] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2], validStartDays: ["Saturday"] },
        };
        const anonKv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                name: "Boss",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: cfg.campgrounds,
                globalSettings: cfg.globalSettings,
                updatedAt: "2024-01-02",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(anonKv as never);
        vi.mocked(cloudflare.getEnv).mockReturnValue({ BOOTSTRAP_ADMIN_EMAIL: "boss@example.com", SUBSCRIBERS: anonKv } as never);
        vi.mocked(userCampgrounds.getUserCampgrounds).mockResolvedValue({
            campgrounds: cfg.campgrounds,
            globalSettings: cfg.globalSettings,
            updatedAt: "2024-01-02",
        } as never);
        // Site "1": has an Available Saturday that starts a 2-night run → will have matches.
        // Site "2": no available dates → no matches, should be filtered out.
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: {
                        "1": {
                            site: "001",
                            campsite_type: "STANDARD",
                            availabilities: {
                                "2026-07-04T00:00:00Z": "Available",
                                "2026-07-05T00:00:00Z": "Available",
                            },
                        },
                        "2": {
                            site: "002",
                            campsite_type: "STANDARD",
                            availabilities: {},
                        },
                    },
                }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        const body = (await response.json()) as {
            campgrounds: Array<{ siteAvailability: Record<string, unknown>; totalSitesCount: number }>;
        };
        expect(body.campgrounds).toHaveLength(1);
        const cg = body.campgrounds[0]!;
        // 2 raw sites before filter.
        expect(cg.totalSitesCount).toBe(2);
        // Only the site with matches survives.
        expect(Object.keys(cg.siteAvailability)).toHaveLength(1);
        expect(cg.siteAvailability["1"]).toBeDefined();
        expect(cg.siteAvailability["2"]).toBeUndefined();
    });
});
