import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe("getUserTripWindows", () => {
    it("returns data from the dedicated key when it exists", async () => {
        const record = {
            tripWindows: [{ id: "w1", from: "2026-09-04", to: "2026-09-08" }],
            updatedAt: "2026-08-17T00:00:00.000Z",
        };
        const kv = createMockKv({
            "user:u@x.com:trip-windows": JSON.stringify(record),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toHaveLength(1);
        expect(result.tripWindows[0]!.id).toBe("w1");
    });

    it("migrates from the campgrounds blob when the dedicated key is empty", async () => {
        const kv = createMockKv({
            "user:u@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: {
                    stayLengths: [2],
                    validStartDays: ["Friday"],
                    tripWindows: [{ id: "legacy", from: "2026-09-01", to: "2026-09-03" }],
                },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");

        // Trip windows migrated to the new key
        expect(result.tripWindows).toHaveLength(1);
        expect(result.tripWindows[0]!.id).toBe("legacy");

        // New key was written
        const newKeyRaw = kv._store.get("user:u@x.com:trip-windows");
        expect(newKeyRaw).toBeDefined();
        const newKey = JSON.parse(newKeyRaw!);
        expect(newKey.tripWindows).toHaveLength(1);

        // Old blob had tripWindows stripped
        const oldRaw = kv._store.get("user:u@x.com:campgrounds");
        const old = JSON.parse(oldRaw!);
        expect(old.globalSettings.tripWindows).toBeUndefined();
    });

    it("returns empty when neither key has trip windows", async () => {
        const kv = createMockKv({
            "user:u@x.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toEqual([]);
        expect(result.updatedAt).toBeNull();
    });

    it("returns empty when no campgrounds record exists at all", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { getUserTripWindows } = await import("./user-trip-windows");
        const result = await getUserTripWindows("u@x.com");
        expect(result.tripWindows).toEqual([]);
        expect(result.updatedAt).toBeNull();
    });
});

describe("putUserTripWindows", () => {
    it("writes to the dedicated key and returns the record with updatedAt", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const { putUserTripWindows } = await import("./user-trip-windows");
        const result = await putUserTripWindows("u@x.com", [
            { id: "w1", from: "2026-09-04", to: "2026-09-08" },
        ]);
        expect(result.tripWindows).toHaveLength(1);
        expect(result.updatedAt).not.toBeNull();

        // Verify it was persisted
        const raw = kv._store.get("user:u@x.com:trip-windows");
        expect(raw).toBeDefined();
        const stored = JSON.parse(raw!);
        expect(stored.tripWindows[0].id).toBe("w1");
    });
});
