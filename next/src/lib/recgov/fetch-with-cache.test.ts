import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchMonthWithCache } from "./fetch-with-cache";
import type { KvAdapter, AvailabilitySnapshot } from "./cache";
import type { RawMonthResult } from "./types";

function createMockAdapter(initial: Record<string, RawMonthResult> = {}): KvAdapter & {
    raw: Record<string, RawMonthResult>;
} {
    const raw: Record<string, RawMonthResult> = { ...initial };
    return {
        raw,
        async getRaw(facilityId, month) {
            return raw[`${facilityId}:${month}`] ?? null;
        },
        async putRaw(facilityId, month, value) {
            raw[`${facilityId}:${month}`] = value;
        },
        async getSnapshot(): Promise<AvailabilitySnapshot | null> {
            return null;
        },
        async putSnapshot(): Promise<void> {},
        async deleteSnapshot(): Promise<void> {},
    };
}

describe("fetchMonthWithCache", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("returns cached value without calling rec.gov on hit", async () => {
        const cached: RawMonthResult = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        const adapter = createMockAdapter({ "232358:2026-07": cached });
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toEqual(cached);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fetches rec.gov and writes through to cache on miss", async () => {
        const fresh: RawMonthResult = { campsites: {} };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(fresh), { status: 200 }));
        const adapter = createMockAdapter();
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toEqual(fresh);
        expect(fetchSpy).toHaveBeenCalledOnce();
        expect(adapter.raw["232358:2026-07"]).toEqual(fresh);
    });

    it("returns null and does not cache when rec.gov fails", async () => {
        fetchSpy.mockResolvedValue(new Response("error", { status: 500 }));
        const adapter = createMockAdapter();
        const result = await fetchMonthWithCache("232358", "2026-07", adapter);
        expect(result).toBeNull();
        expect(adapter.raw["232358:2026-07"]).toBeUndefined();
    });
});
