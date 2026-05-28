import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";
import * as userCampgrounds from "@/lib/user-campgrounds";

vi.mock("@/lib/sessions");
vi.mock("@/lib/cloudflare");
vi.mock("@/lib/user-campgrounds");

function createMockKv() {
    const store = new Map<string, string>();
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
                JSON.stringify({ campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.campgrounds).toHaveLength(1);
        expect(fetchSpy).toHaveBeenCalled();
    });

    it("anonymous request uses curated default config", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        kv._store.set(
            "config:campgrounds",
            JSON.stringify({
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
            }),
        );
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({ campsites: {} }),
                { status: 200 },
            ),
        );

        const response = await GET(new Request("http://x/api/availability"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.campgrounds)).toBe(true);
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
});
