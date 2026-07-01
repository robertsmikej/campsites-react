import { describe, it, expect } from "vitest";
import { rawCacheKey, snapshotCacheKey, RAW_CACHE_TTL_SECONDS, SNAPSHOT_CACHE_TTL_SECONDS } from "./cache";

describe("cache key helpers", () => {
    it("rawCacheKey builds recgov:{fac}:{month}", () => {
        expect(rawCacheKey("232358", "2026-07")).toBe("recgov:232358:2026-07");
    });

    it("snapshotCacheKey builds snapshot:{email}", () => {
        expect(snapshotCacheKey("alice@example.com")).toBe("snapshot:alice@example.com");
    });

    it("raw cache TTL is 1 hour", () => {
        expect(RAW_CACHE_TTL_SECONDS).toBe(3600);
    });

    it("snapshot cache TTL is 3 minutes", () => {
        expect(SNAPSHOT_CACHE_TTL_SECONDS).toBe(180);
    });
});
