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
vi.mock("@/lib/recgov-facility", () => ({
    parseFacilityId: vi.fn(),
    fetchFacilitySummary: vi.fn(),
}));

import * as sessions from "@/lib/sessions";
import * as cloudflare from "@/lib/cloudflare";
import * as recgov from "@/lib/recgov-facility";
import type { FacilitySummary } from "@/lib/recgov-facility";

const MOCK_SESSION = { id: "s1", email: "u@x.com", createdAt: "x", expiresAt: "x" };

const MOCK_SUMMARY: FacilitySummary = {
    id: "232358",
    name: "Outlet Campground",
    type: "campground",
    area: "Stanley",
};

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

async function get(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(
        new Request(`https://example.com/api/recgov/facility/${id}`),
        { params: Promise.resolve({ id }) },
    );
}

describe("GET /api/recgov/facility/[id]", () => {
    it("401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(recgov.parseFacilityId).mockReturnValue("232358");
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get("232358")).status).toBe(401);
    });

    it("400 when parseFacilityId returns null", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(MOCK_SESSION);
        vi.mocked(recgov.parseFacilityId).mockReturnValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get("abc")).status).toBe(400);
    });

    it("200 cached: returns summary from KV with cached: true", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(MOCK_SESSION);
        vi.mocked(recgov.parseFacilityId).mockReturnValue("232358");
        const kv = createMockKv({
            "recgov:facility:232358": JSON.stringify(MOCK_SUMMARY),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get("232358");
        expect(res.status).toBe(200);
        const body = await res.json() as { summary: FacilitySummary; cached: boolean };
        expect(body.cached).toBe(true);
        expect(body.summary.name).toBe("Outlet Campground");
    });

    it("200 fresh fetch: calls fetchFacilitySummary, writes to KV, returns cached: false", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(MOCK_SESSION);
        vi.mocked(recgov.parseFacilityId).mockReturnValue("232358");
        vi.mocked(recgov.fetchFacilitySummary).mockResolvedValue(MOCK_SUMMARY);
        const kv = createMockKv();
        const putSpy = vi.spyOn(kv, "put");
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get("232358");
        expect(res.status).toBe(200);
        const body = await res.json() as { summary: FacilitySummary; cached: boolean };
        expect(body.cached).toBe(false);
        expect(body.summary.name).toBe("Outlet Campground");

        // KV was written with expirationTtl
        expect(putSpy).toHaveBeenCalledWith(
            "recgov:facility:232358",
            JSON.stringify(MOCK_SUMMARY),
            { expirationTtl: 86400 },
        );
    });

    it("404 when fetchFacilitySummary returns null", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(MOCK_SESSION);
        vi.mocked(recgov.parseFacilityId).mockReturnValue("232358");
        vi.mocked(recgov.fetchFacilitySummary).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await get("232358");
        expect(res.status).toBe(404);
        const body = await res.json() as { error: string };
        expect(body.error).toBe("Facility not found");
    });

    it("502 when fetchFacilitySummary throws", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(MOCK_SESSION);
        vi.mocked(recgov.parseFacilityId).mockReturnValue("232358");
        vi.mocked(recgov.fetchFacilitySummary).mockRejectedValue(new Error("network fail"));
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());

        const res = await get("232358");
        expect(res.status).toBe(502);
        const body = await res.json() as { error: string };
        expect(body.error).toBe("Facility lookup failed");
    });
});
