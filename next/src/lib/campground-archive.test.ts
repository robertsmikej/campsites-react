import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";
import {
    getCampgroundArchive,
    archiveRemovedCampgrounds,
    restoreCampground,
    ARCHIVE_CAP,
    type ArchivedCampground,
} from "./campground-archive";
import { defaultDates } from "./default-dates";
import type { Campground } from "@/types/campground";

beforeEach(() => {
    vi.clearAllMocks();
});

function cg(id: string, extra: Partial<Campground> = {}): Campground {
    return {
        id,
        name: `Camp ${id}`,
        sites: { favorites: [`${id}-fav`], worthwhile: [] },
        ...extra,
    };
}

const KEY = "user:mike@example.com:campground-archive";

describe("getCampgroundArchive", () => {
    it("returns an empty archive when none exists", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const a = await getCampgroundArchive("mike@example.com");
        expect(a.campgrounds).toEqual([]);
    });

    it("returns entries sorted by removedAt descending", async () => {
        const stored = {
            campgrounds: [
                { ...cg("1"), removedAt: "2026-01-01T00:00:00.000Z" },
                { ...cg("2"), removedAt: "2026-06-01T00:00:00.000Z" },
            ],
        };
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv({ [KEY]: JSON.stringify(stored) }));
        const a = await getCampgroundArchive("mike@example.com");
        expect(a.campgrounds.map((c) => c.id)).toEqual(["2", "1"]);
    });
});

describe("archiveRemovedCampgrounds", () => {
    it("appends removed campgrounds with removedAt", async () => {
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds("mike@example.com", [cg("9")], "2026-06-10T00:00:00.000Z");
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(1);
        expect(stored.campgrounds[0]).toMatchObject({
            id: "9",
            sites: { favorites: ["9-fav"], worthwhile: [] },
            removedAt: "2026-06-10T00:00:00.000Z",
        });
    });

    it("upserts by id — a newer removal replaces the older entry", async () => {
        const prior = {
            campgrounds: [{ ...cg("9", { name: "Old Name" }), removedAt: "2026-01-01T00:00:00.000Z" }],
        };
        const kv = createMockKv({ [KEY]: JSON.stringify(prior) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds(
            "mike@example.com",
            [cg("9", { name: "New Name" })],
            "2026-06-10T00:00:00.000Z",
        );
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(1);
        expect(stored.campgrounds[0]).toMatchObject({
            name: "New Name",
            removedAt: "2026-06-10T00:00:00.000Z",
        });
    });

    it("caps the archive at ARCHIVE_CAP newest entries", async () => {
        const prior = {
            campgrounds: Array.from({ length: ARCHIVE_CAP }, (_, i) => ({
                ...cg(`old-${i}`),
                // Use i as seconds so every removedAt is unique and sortable
                removedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
            })),
        };
        const kv = createMockKv({ [KEY]: JSON.stringify(prior) });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        await archiveRemovedCampgrounds("mike@example.com", [cg("newest")], "2026-06-10T00:00:00.000Z");
        const stored = JSON.parse((await kv.get(KEY)) as string) as {
            campgrounds: ArchivedCampground[];
        };
        expect(stored.campgrounds).toHaveLength(ARCHIVE_CAP);
        expect(stored.campgrounds[0]?.id).toBe("newest");
        // The oldest entry (second :00) fell off
        expect(stored.campgrounds.some((c) => c.removedAt === "2026-01-01T00:00:00.000Z")).toBe(false);
    });
});

describe("restoreCampground", () => {
    it("keeps config, resets dates to the season default, strips checkPriority and removedAt", () => {
        const archived: ArchivedCampground = {
            ...cg("7", {
                notifyScope: "favorites",
                stayLengths: [2, 3],
                validStartDays: ["Friday"],
                checkPriority: "high",
                enabled: false,
                dates: { startDate: "2025-05-01", endDate: "2025-09-30" },
            }),
            removedAt: "2025-10-01T00:00:00.000Z",
        };
        const restored = restoreCampground(archived);
        expect(restored).toMatchObject({
            id: "7",
            sites: { favorites: ["7-fav"], worthwhile: [] },
            notifyScope: "favorites",
            stayLengths: [2, 3],
            validStartDays: ["Friday"],
            enabled: true,
        });
        expect(restored.dates).toEqual(defaultDates());
        expect("checkPriority" in restored).toBe(false);
        expect("removedAt" in restored).toBe(false);
    });
});
