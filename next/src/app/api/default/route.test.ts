import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.clearAllMocks();
});

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET();
}

function wire(kv: ReturnType<typeof createMockKv>, bootstrap?: string) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: bootstrap,
        SUBSCRIBERS: kv,
    } as never);
}

describe("GET /api/default", () => {
    it("returns the curator's watchlist record as the default", async () => {
        const kv = createMockKv({
            "user:boss@example.com:profile": JSON.stringify({
                email: "boss@example.com",
                name: "Boss",
                roles: ["curator"],
                createdAt: "2024-01-01",
            }),
            "user:boss@example.com:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        { id: "123", name: "My Camp", sites: { favorites: [], worthwhile: [] } },
                    ],
                },
                globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday"] },
                updatedAt: "2024-01-02",
            }),
        });
        wire(kv, "boss@example.com");

        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: { "recreation.gov": { id: string }[] } };
        expect(body.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["123"]);
    });

    it("falls back to the catalog when no curator record exists", async () => {
        const kv = createMockKv({});
        wire(kv, "boss@example.com");

        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { campgrounds: { "recreation.gov": { id: string }[] } };
        expect(body.campgrounds["recreation.gov"].length).toBeGreaterThan(0);
    });

    it("no longer exports PUT", async () => {
        const mod = (await import("./route")) as Record<string, unknown>;
        expect(mod.PUT).toBeUndefined();
    });
});
