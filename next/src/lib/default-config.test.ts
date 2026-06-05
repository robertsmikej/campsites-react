import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

// Mock only the Cloudflare seam; lib/users + lib/user-campgrounds run for real
// against the mock KV so we exercise the real resolution path.
vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.clearAllMocks();
});

function wire(kv: ReturnType<typeof createMockKv>, bootstrap?: string) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: bootstrap,
        SUBSCRIBERS: kv,
    } as never);
}

const curatorProfile = (email: string) =>
    JSON.stringify({ email, name: "C", roles: ["curator"], createdAt: "2024-01-01" });
const record = (campgroundIds: string[], stayLengths = [2, 3]) =>
    JSON.stringify({
        campgrounds: {
            "recreation.gov": campgroundIds.map((id) => ({
                id,
                name: `Camp ${id}`,
                sites: { favorites: [], worthwhile: [] },
            })),
        },
        globalSettings: { stayLengths, validStartDays: ["Friday"] },
        updatedAt: "2024-01-02",
    });

describe("resolveDefaultOwnerEmail", () => {
    it("returns the bootstrap admin when they hold the curator role", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
        });
        wire(kv, "boss@example.com");
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBe("boss@example.com");
    });

    it("falls back to the first curator when bootstrap is unset", async () => {
        const kv = createMockKv({
            "user:someone@example.com:profile": curatorProfile("someone@example.com"),
        });
        wire(kv, undefined);
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBe("someone@example.com");
    });

    it("returns null when there is no curator", async () => {
        const kv = createMockKv({});
        wire(kv, "boss@example.com");
        const { resolveDefaultOwnerEmail } = await import("./default-config");
        expect(await resolveDefaultOwnerEmail()).toBeNull();
    });
});

describe("getDefaultConfig", () => {
    it("returns the owner's watchlist record when present", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
            "user:boss@example.com:campgrounds": record(["A", "B"], [4, 5]),
        });
        wire(kv, "boss@example.com");
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["A", "B"]);
        expect(cfg.globalSettings.stayLengths).toEqual([4, 5]);
    });

    it("falls back to the in-repo catalog when the owner has no record", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": curatorProfile("boss@example.com"),
        });
        wire(kv, "boss@example.com");
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });

    it("falls back to the catalog when there is no curator at all", async () => {
        const kv = createMockKv({});
        wire(kv, undefined);
        const { getDefaultConfig } = await import("./default-config");
        const cfg = await getDefaultConfig();
        expect(cfg.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });
});
