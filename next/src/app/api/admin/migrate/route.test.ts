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
import { campgroundCatalog } from "@/data/campground-catalog";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

const SECRET = "test-api-secret";
const ALL_CATALOG_IDS = (campgroundCatalog["recreation.gov"] ?? []).map((c) => c.id);

async function post(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { POST } = await import("./route");
    return POST(new Request("https://example.com/api/admin/migrate", { method: "POST", headers }));
}

describe("POST /api/admin/migrate", () => {
    it("returns 401 without any auth", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        expect((await post()).status).toBe(401);
    });

    it("returns 401 with wrong Bearer and no session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        expect((await post("Bearer wrong")).status).toBe(401);
    });

    it("returns 401 with a signed-in non-curator session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({ email: "user@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        expect((await post()).status).toBe(401);
    });

    it("accepts a curator session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({
                email: "curator@x.com",
                roles: ["curator"],
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const res = await post();
        expect(res.status).toBe(200);
    });

    it("seeds all catalog campgrounds when KV is empty", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { defaultUpdated: boolean; addedCampgrounds: Array<{ id: string }> };
        expect(body.defaultUpdated).toBe(true);
        expect(body.addedCampgrounds.map((c) => c.id).sort()).toEqual([...ALL_CATALOG_IDS].sort());

        const stored = (await kv.get("config:campgrounds", "json")) as { campgrounds: { "recreation.gov": Array<{ id: string }> } };
        const storedIds = stored.campgrounds["recreation.gov"].map((c) => c.id);
        for (const id of ALL_CATALOG_IDS) {
            expect(storedIds).toContain(id);
        }
    });

    it("does not duplicate when all catalog entries are already present", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": ALL_CATALOG_IDS.map((id) => ({
                        id,
                        name: "Campground",
                        sites: { favorites: [], worthwhile: [] },
                    })),
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as { defaultUpdated: boolean; addedCampgrounds: unknown[] };
        expect(body.defaultUpdated).toBe(false);
        expect(body.addedCampgrounds).toEqual([]);
    });

    it("appends only catalog entries that aren't in KV yet", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        // Seed KV with only the first two catalog entries.
        const presentIds = ALL_CATALOG_IDS.slice(0, 2);
        const missingIds = ALL_CATALOG_IDS.slice(2);
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": presentIds.map((id) => ({
                        id,
                        name: "Campground",
                        sites: { favorites: [], worthwhile: [] },
                    })),
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as { addedCampgrounds: Array<{ id: string }> };
        expect(body.addedCampgrounds.map((c) => c.id).sort()).toEqual([...missingIds].sort());
    });

    it("preserves existing curator-edited campground entries verbatim", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const curatorEntry = {
            id: ALL_CATALOG_IDS[0],
            name: "Curator-Renamed",
            sites: { favorites: ["001"], worthwhile: ["002"] },
            notifyAll: true,
        };
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [curatorEntry] },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        await post(`Bearer ${SECRET}`);

        const stored = (await kv.get("config:campgrounds", "json")) as {
            campgrounds: { "recreation.gov": Array<{ id: string; name: string; notifyAll?: boolean }> };
        };
        const entry = stored.campgrounds["recreation.gov"].find((c) => c.id === curatorEntry.id);
        expect(entry?.name).toBe("Curator-Renamed");
        expect(entry?.notifyAll).toBe(true);
    });

    it("backfills mapImage from old image:*_map*.jpg pattern", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        { id: "232358", name: "Outlet", image: "outlet_campground_map.jpg", sites: { favorites: [], worthwhile: [] } },
                        { id: "232085", name: "Point", image: "point_campground.jpeg", sites: { favorites: [], worthwhile: [] } },
                    ],
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);

        const stored = (await kv.get("config:campgrounds", "json")) as {
            campgrounds: { "recreation.gov": Array<{ id: string; image?: string; mapImage?: string }> };
        };
        const outlet = stored.campgrounds["recreation.gov"].find((c) => c.id === "232358");
        expect(outlet?.mapImage).toBe("outlet_campground_map.jpg");
        expect(outlet?.image).toBeUndefined();

        // Non-map image is left alone.
        const point = stored.campgrounds["recreation.gov"].find((c) => c.id === "232085");
        expect(point?.image).toBe("point_campground.jpeg");
    });

    it("response does not include emailsDeleted", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as Record<string, unknown>;
        expect("emailsDeleted" in body).toBe(false);
    });
});
