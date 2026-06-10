import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

vi.mock("@/lib/sessions", () => ({
    readSession: vi.fn(),
    SESSION_COOKIE: "campwatch_session",
}));

import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/users/me/campgrounds/archive"));
}

describe("GET /api/users/me/campgrounds/archive", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doGet();
        expect(res.status).toBe(401);
    });

    it("returns an empty archive for a fresh user", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doGet();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ campgrounds: [] });
    });

    it("returns archived entries newest first", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const stored = {
            campgrounds: [
                {
                    id: "1",
                    name: "Older",
                    sites: { favorites: [], worthwhile: [] },
                    removedAt: "2026-01-01T00:00:00.000Z",
                },
                {
                    id: "2",
                    name: "Newer",
                    sites: { favorites: [], worthwhile: [] },
                    removedAt: "2026-06-01T00:00:00.000Z",
                },
            ],
        };
        vi.mocked(cloudflare.getKv).mockReturnValue(
            createMockKv({ "user:user@example.com:campground-archive": JSON.stringify(stored) }),
        );
        const res = await doGet();
        const body = (await res.json()) as { campgrounds: Array<{ id: string }> };
        expect(body.campgrounds.map((c) => c.id)).toEqual(["2", "1"]);
    });
});
