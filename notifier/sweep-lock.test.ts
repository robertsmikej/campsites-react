import { describe, it, expect, vi } from "vitest";
import { acquireSweepLock } from "./sweep-lock";

function lockKv(initial?: string) {
    const store = new Map<string, string>();
    if (initial !== undefined) store.set("notifier:sweep-lock", initial);
    return {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    };
}
const LEASE = 4 * 60 * 1000;
const NOW = 1_781_790_000_000;

describe("acquireSweepLock", () => {
    it("acquires when no lock exists and writes the lease", async () => {
        const kv = lockKv();
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalledWith("notifier:sweep-lock", String(NOW), { expirationTtl: 300 });
    });
    it("refuses when a fresh lease is held", async () => {
        const kv = lockKv(String(NOW - 60_000)); // 1 min ago, within the 4-min lease
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(false);
        expect(kv.put).not.toHaveBeenCalled();
    });
    it("acquires when the existing lease is stale", async () => {
        const kv = lockKv(String(NOW - LEASE - 1000)); // older than the lease
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalled();
    });
    it("acquires when the stored value is garbage", async () => {
        const kv = lockKv("not-a-number");
        expect(await acquireSweepLock(kv, NOW, LEASE)).toBe(true);
    });
});
