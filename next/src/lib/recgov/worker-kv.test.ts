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

    it("putRaw sets the 5-minute TTL", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        expect(kv.put).toHaveBeenCalledWith(
            "recgov:232358:2026-07",
            expect.any(String),
            expect.objectContaining({ expirationTtl: 300 }),
        );
    });

    it("deleteSnapshot calls KV delete with the right key", async () => {
        const kv = createMockKv();
        const adapter = new WorkerKvAdapter(kv as never);
        await adapter.deleteSnapshot("alice@example.com");
        expect(kv.delete).toHaveBeenCalledWith("snapshot:alice@example.com");
    });
});
