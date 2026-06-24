import { describe, it, expect, vi } from "vitest";
import { acquireNotifyLock, releaseNotifyLock } from "./notify-lock";

function lockKv(initial?: string) {
    const store = new Map<string, string>();
    if (initial !== undefined) store.set("notifier:notify-lock", initial);
    return {
        get: vi.fn(async (k: string) => store.get(k) ?? null),
        put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
        store,
    };
}
const LEASE = 2 * 60 * 1000;
const NOW = 1_781_790_000_000;

describe("acquireNotifyLock", () => {
    it("acquires when no lock exists and writes the lease with a TTL backstop", async () => {
        const kv = lockKv();
        expect(await acquireNotifyLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalledWith("notifier:notify-lock", String(NOW), { expirationTtl: 180 });
    });

    it("refuses when a fresh lease is held", async () => {
        const kv = lockKv(String(NOW - 30_000)); // 30s ago, within the 2-min lease
        expect(await acquireNotifyLock(kv, NOW, LEASE)).toBe(false);
        expect(kv.put).not.toHaveBeenCalled();
    });

    it("acquires when the existing lease is stale (crashed holder)", async () => {
        const kv = lockKv(String(NOW - LEASE - 1000));
        expect(await acquireNotifyLock(kv, NOW, LEASE)).toBe(true);
        expect(kv.put).toHaveBeenCalled();
    });

    it("acquires after a release (value '0' reads as always-stale)", async () => {
        const kv = lockKv(String(NOW - 1000)); // a fresh lease...
        await releaseNotifyLock(kv); // ...that the holder releases
        expect(await acquireNotifyLock(kv, NOW, LEASE)).toBe(true);
    });

    it("acquires when the stored value is garbage", async () => {
        const kv = lockKv("not-a-number");
        expect(await acquireNotifyLock(kv, NOW, LEASE)).toBe(true);
    });
});

describe("releaseNotifyLock", () => {
    it("writes a stale marker with the minimum TTL", async () => {
        const kv = lockKv(String(NOW));
        await releaseNotifyLock(kv);
        expect(kv.put).toHaveBeenCalledWith("notifier:notify-lock", "0", { expirationTtl: 60 });
    });
});
