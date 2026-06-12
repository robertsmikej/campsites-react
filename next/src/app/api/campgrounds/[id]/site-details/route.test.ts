import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cloudflare", () => ({ getKv: vi.fn() }));
import { getKv } from "@/lib/cloudflare";

function mockKv(initial: Record<string, unknown> = {}) {
    const store = new Map(Object.entries(initial));
    return {
        get: vi.fn(async (k: string, _t?: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, JSON.parse(v))),
    };
}

async function doGet(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request(`https://campwatch.dev/api/campgrounds/${id}/site-details`), {
        params: Promise.resolve({ id }),
    } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/campgrounds/[id]/site-details", () => {
    it("400s a non-numeric id", async () => {
        vi.mocked(getKv).mockReturnValue(mockKv() as never);
        expect((await doGet("abc")).status).toBe(400);
    });

    it("returns parsed sites from a fresh upstream fetch and caches them", async () => {
        const kv = mockKv();
        vi.mocked(getKv).mockReturnValue(kv as never);
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    campsites: [
                        {
                            campsite_id: "1",
                            name: "002",
                            latitude: 44.1,
                            longitude: -114.9,
                            average_rating: 4,
                            number_of_ratings: 2,
                            aggregate_cell_coverage: 3,
                            permitted_equipment: [{ equipment_name: "Tent", max_length: 0 }],
                            attributes: [
                                {
                                    attribute_category: "site_details",
                                    attribute_name: "Shade",
                                    attribute_value: "Full",
                                },
                            ],
                        },
                    ],
                }),
                { status: 200 },
            ),
        );
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { sites: Array<{ id: string; lat: number; shade?: string }> };
        expect(body.sites).toHaveLength(1);
        expect(body.sites[0]).toMatchObject({ id: "002", shade: "full" });
        expect(kv.put).toHaveBeenCalled(); // cached
    });

    it("serves from cache without fetching", async () => {
        const kv = mockKv({
            "site-details:232358": [
                {
                    id: "002",
                    campsiteId: "1",
                    lat: null,
                    lng: null,
                    type: "tent",
                    rating: null,
                    reviews: 0,
                    cell: null,
                    amenities: {},
                },
            ],
        });
        vi.mocked(getKv).mockReturnValue(kv as never);
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        expect(((await res.json()) as { sites: unknown[] }).sites).toHaveLength(1);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns empty sites (no cache write) when upstream fails", async () => {
        const kv = mockKv();
        vi.mocked(getKv).mockReturnValue(kv as never);
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
        const res = await doGet("232358");
        expect(res.status).toBe(200);
        expect(((await res.json()) as { sites: unknown[] }).sites).toEqual([]);
        expect(kv.put).not.toHaveBeenCalled();
    });
});
