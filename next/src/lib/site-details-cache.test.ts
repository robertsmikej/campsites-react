import { describe, it, expect, vi } from "vitest";
import { getSiteDetailsCached, type KvLike } from "./site-details-cache";

function fakeKv(initial: Record<string, unknown> = {}): KvLike & { store: Record<string, unknown> } {
    const store: Record<string, unknown> = { ...initial };
    return {
        store,
        getJson: async <T>(key: string) => (store[key] ?? null) as T | null,
        put: async (key: string, value: unknown) => { store[key] = value; },
    };
}

const okResponse = (campsites: unknown[]) =>
    ({ ok: true, json: async () => ({ campsites }) }) as unknown as Response;

describe("getSiteDetailsCached", () => {
    it("returns cached details without fetching", async () => {
        const kv = fakeKv({ "site-details:232358": [{ id: "012", campsiteId: "1", lat: null, lng: null, type: "tent", rating: null, reviews: 0, cell: null, amenities: {} }] });
        const fetchImpl = vi.fn();
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites).toHaveLength(1);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("fetches, parses, and stores on a cold cache", async () => {
        const kv = fakeKv();
        const fetchImpl = vi.fn().mockResolvedValue(
            okResponse([{ name: "012", latitude: "44.1", longitude: "-114.9", loop: "L1" }]),
        );
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites[0]?.id).toBe("012");
        expect(kv.store["site-details:232358"]).toBeDefined();
    });

    it("returns [] and does not cache on fetch failure", async () => {
        const kv = fakeKv();
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
        const sites = await getSiteDetailsCached("232358", kv, fetchImpl as unknown as typeof fetch);
        expect(sites).toEqual([]);
        expect(kv.store["site-details:232358"]).toBeUndefined();
    });
});
