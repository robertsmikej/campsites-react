import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";
import * as cloudflare from "./cloudflare";
import {
    getUserCampgrounds,
    putUserCampgrounds,
    deleteUserCampgrounds,
} from "./user-campgrounds";

beforeEach(() => {
    vi.resetModules();
});

describe("user campgrounds storage", () => {
    it("returns null for an unknown email", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());
        expect(await getUserCampgrounds("nope@example.com")).toBeNull();
    });

    it("writes and reads a record", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const record = {
            campgrounds: { "recreation.gov": [] as never[] },
            globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
        };
        const stored = await putUserCampgrounds("user@example.com", record);
        expect(stored.campgrounds).toEqual(record.campgrounds);
        expect(stored.globalSettings).toEqual(record.globalSettings);
        expect(typeof stored.updatedAt).toBe("string");

        const reread = await getUserCampgrounds("user@example.com");
        expect(reread).toEqual(stored);
    });

    it("round-trip preserves campgrounds and globalSettings byte-for-byte", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const record = {
            campgrounds: {
                "recreation.gov": [
                    {
                        id: "232493",
                        name: "Yosemite Valley",
                        sites: { favorites: ["1", "2"], worthwhile: ["3"] },
                    },
                ],
            },
            globalSettings: { stayLengths: [2, 3, 4], validStartDays: ["Friday", "Saturday"] },
        };

        const stored = await putUserCampgrounds("roundtrip@example.com", record);
        const reread = await getUserCampgrounds("roundtrip@example.com");

        expect(reread?.campgrounds).toEqual(record.campgrounds);
        expect(reread?.globalSettings).toEqual(record.globalSettings);
        expect(reread?.updatedAt).toBe(stored.updatedAt);
    });

    it("delete removes the record", async () => {
        const kv = createMockKv({
            "user:user@example.com:campgrounds": JSON.stringify({
                campgrounds: {},
                globalSettings: {},
                updatedAt: "x",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        await deleteUserCampgrounds("user@example.com");
        expect(await getUserCampgrounds("user@example.com")).toBeNull();
    });
});
