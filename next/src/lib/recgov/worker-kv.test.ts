import { describe, it, expect, vi } from "vitest";
import { WorkerKvAdapter } from "./worker-kv";
import type { RawMonthResult } from "./types";

function createMockKv() {
    const store = new Map<string, string>();
    return {
        get: vi.fn(async (key: string, type?: string) => {
            const value = store.get(key);
            if (value === undefined) return null;
            return type === "json" ? JSON.parse(value) : value;
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

describe("WorkerKvAdapter", () => {
    it("putRaw + getRaw round-trips", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const value: RawMonthResult = { campsites: {} };
        await adapter.putRaw("232358", "2026-07", value);
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toEqual(value);
    });

    it("getRaw returns null on miss", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const result = await adapter.getRaw("nope", "2026-07");
        expect(result).toBeNull();
    });

    it("putRaw sets the 1-hour TTL", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        expect(kv.put).toHaveBeenCalledWith(
            "recgov:232358:2026-07",
            expect.any(String),
            expect.objectContaining({ expirationTtl: 3600 }),
        );
    });

    it("putRaw skips the write when the existing value is identical", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const value: RawMonthResult = {
            campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } },
        };
        await adapter.putRaw("232358", "2026-07", value);
        kv.put.mockClear();
        await adapter.putRaw("232358", "2026-07", value);
        expect(kv.put).not.toHaveBeenCalled();
    });

    it("putRaw writes when the existing value differs", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        kv.put.mockClear();
        await adapter.putRaw("232358", "2026-07", {
            campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } },
        });
        expect(kv.put).toHaveBeenCalledOnce();
    });

    it("putSnapshot skips the write when content is identical (ignoring updatedAt)", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.putSnapshot("alice@example.com", {
            updatedAt: "2026-05-29T10:00:00Z",
            campgrounds: [],
        });
        kv.put.mockClear();
        await adapter.putSnapshot("alice@example.com", {
            updatedAt: "2026-05-29T10:05:00Z",
            campgrounds: [],
        });
        expect(kv.put).not.toHaveBeenCalled();
    });

    it("deleteSnapshot calls KV delete with the right key", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.deleteSnapshot("alice@example.com");
        expect(kv.delete).toHaveBeenCalledWith("snapshot:alice@example.com");
    });

    // KvLike methods — required so the scheduled-worker path passes kvAsKvLike
    it("getJson returns parsed JSON from the underlying namespace", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const payload = [{ id: "site-1", lat: 45.1, lng: -121.5 }];
        kv._store.set("site-details:12345", JSON.stringify(payload));
        const result = await adapter.getJson("site-details:12345");
        expect(result).toEqual(payload);
    });

    it("getJson returns null on a cache miss", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const result = await adapter.getJson("site-details:missing");
        expect(result).toBeNull();
    });

    it("put calls the underlying namespace with stringified value and expirationTtl", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        const payload = { foo: "bar" };
        await adapter.put("some-key", payload, 3600);
        expect(kv.put).toHaveBeenCalledWith("some-key", JSON.stringify(payload), { expirationTtl: 3600 });
    });
});
