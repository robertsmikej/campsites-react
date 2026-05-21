import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));
vi.mock("@/lib/responses", async () => {
    const actual = await vi.importActual("@/lib/responses");
    return actual;
});

import * as cloudflare from "@/lib/cloudflare";
import type { CampgroundDetails } from "./route";

const MOCK_DETAILS: CampgroundDetails = {
    facilityId: "232358",
    name: "Outlet Campground",
    previewImageUrl: "https://cdn.recreation.gov/img/outlet.jpg",
    latitude: 44.2,
    longitude: -114.9,
    cachedAt: Date.now(),
};

// Helper: build a fixed cachedAt far in the future so cache hit always works
function futureCachedAt(): number {
    return Date.now() + 1000 * 60 * 60 * 24 * 29; // 29 days from now
}

async function get(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request(`https://example.com/api/campgrounds/${id}/details`), {
        params: Promise.resolve({ id }),
    });
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe("GET /api/campgrounds/[id]/details", () => {
    it("400 for non-numeric id", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await get("abc");
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Invalid campground id");
    });

    it("returns cached result when cache is fresh", async () => {
        const cached = { ...MOCK_DETAILS, cachedAt: futureCachedAt() };
        const kv = createMockKv({ "cg-details:232358": JSON.stringify(cached) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get("232358");
        expect(res.status).toBe(200);
        const body = (await res.json()) as CampgroundDetails;
        expect(body.name).toBe("Outlet Campground");
        expect(body.previewImageUrl).toBe("https://cdn.recreation.gov/img/outlet.jpg");
    });

    it("fetches fresh data and writes to KV when cache is stale", async () => {
        // Stale cache entry (cachedAt = 0, way in the past)
        const stale = { ...MOCK_DETAILS, cachedAt: 0 };
        const kv = createMockKv({ "cg-details:232358": JSON.stringify(stale) });
        const putSpy = vi.spyOn(kv, "put");
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        // Mock fetch: campground endpoint returns lat/lng + name
        // search endpoint returns preview_image_url
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if ((url as string).includes("/api/camps/campgrounds/")) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                campground: {
                                    facility_name: "Outlet Campground",
                                    facility_latitude: 44.2,
                                    facility_longitude: -114.9,
                                },
                            }),
                    } as Response);
                }
                if ((url as string).includes("/api/search")) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                results: [
                                    { entity_id: "999", preview_image_url: "https://other.jpg" },
                                    {
                                        entity_id: "232358",
                                        preview_image_url: "https://cdn.recreation.gov/img/outlet.jpg",
                                    },
                                ],
                            }),
                    } as Response);
                }
                return Promise.resolve({ ok: false } as Response);
            }),
        );

        const res = await get("232358");
        expect(res.status).toBe(200);
        const body = (await res.json()) as CampgroundDetails;
        expect(body.name).toBe("Outlet Campground");
        expect(body.latitude).toBe(44.2);
        expect(body.longitude).toBe(-114.9);
        expect(body.previewImageUrl).toBe("https://cdn.recreation.gov/img/outlet.jpg");

        // Should write to KV
        expect(putSpy).toHaveBeenCalledWith(
            "cg-details:232358",
            expect.stringContaining('"name":"Outlet Campground"'),
            { expirationTtl: 60 * 60 * 24 * 30 },
        );

        vi.unstubAllGlobals();
    });

    it("caches null previewImageUrl when search returns no match", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if ((url as string).includes("/api/camps/campgrounds/")) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                campground: {
                                    facility_name: "Some Campground",
                                    facility_latitude: 40.0,
                                    facility_longitude: -120.0,
                                },
                            }),
                    } as Response);
                }
                // search returns no matching entity_id
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ results: [] }),
                } as Response);
            }),
        );

        const res = await get("111111");
        expect(res.status).toBe(200);
        const body = (await res.json()) as CampgroundDetails;
        expect(body.previewImageUrl).toBeNull();

        vi.unstubAllGlobals();
    });

    it("picks the matching entity_id from search results (not first result)", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((url: string) => {
                if ((url as string).includes("/api/camps/campgrounds/")) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                campground: { facility_name: "Test CG" },
                            }),
                    } as Response);
                }
                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            results: [
                                { entity_id: "000001", preview_image_url: "https://wrong.jpg" },
                                { entity_id: "555555", preview_image_url: "https://correct.jpg" },
                                { entity_id: "000002", preview_image_url: "https://alsowrong.jpg" },
                            ],
                        }),
                } as Response);
            }),
        );

        const res = await get("555555");
        const body = (await res.json()) as CampgroundDetails;
        expect(body.previewImageUrl).toBe("https://correct.jpg");

        vi.unstubAllGlobals();
    });
});
