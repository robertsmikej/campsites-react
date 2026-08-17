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

function authed(kv?: ReturnType<typeof createMockKv>) {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "user@example.com",
        createdAt: "x",
        expiresAt: "x",
    });
    const kvInst = kv ?? createMockKv();
    vi.mocked(cloudflare.getKv).mockReturnValue(kvInst);
    return kvInst;
}

async function doGet(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/users/me/trip-windows"));
}

async function doPut(body: unknown): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/users/me/trip-windows", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

const futureFrom = "2100-09-04";
const futureTo = "2100-09-08";

describe("GET /api/users/me/trip-windows", () => {
    it("returns empty array when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: unknown[] };
        expect(body.tripWindows).toEqual([]);
    });

    it("returns existing trip windows", async () => {
        const kv = createMockKv({
            "user:user@example.com:trip-windows": JSON.stringify({
                tripWindows: [{ id: "w1", from: futureFrom, to: futureTo }],
                updatedAt: "2026-08-17T00:00:00.000Z",
            }),
        });
        authed(kv);
        const res = await doGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows).toHaveLength(1);
        expect(body.tripWindows[0]!.id).toBe("w1");
    });

    it("migrates from campgrounds blob on first access", async () => {
        const kv = createMockKv({
            "user:user@example.com:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: {
                    stayLengths: [2],
                    validStartDays: ["Friday"],
                    tripWindows: [{ id: "legacy", from: futureFrom, to: futureTo }],
                },
                updatedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        authed(kv);
        const res = await doGet();
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows[0]!.id).toBe("legacy");
    });
});

describe("PUT /api/users/me/trip-windows", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await doPut({ tripWindows: [] });
        expect(res.status).toBe(401);
    });

    it("returns 400 for invalid trip windows", async () => {
        authed();
        const res = await doPut({
            tripWindows: [{ id: "", from: futureFrom, to: futureTo }],
        });
        expect(res.status).toBe(400);
    });

    it("stores valid trip windows and returns them", async () => {
        authed();
        const res = await doPut({
            tripWindows: [{ id: "w1", from: futureFrom, to: futureTo, flexDays: 1 }],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }>; updatedAt: string };
        expect(body.tripWindows).toHaveLength(1);
        expect(body.updatedAt).toBeTruthy();

        // Verify persistence via GET
        const getRes = await doGet();
        const getBody = (await getRes.json()) as { tripWindows: Array<{ id: string }> };
        expect(getBody.tripWindows[0]!.id).toBe("w1");
    });

    it("prunes past windows on save", async () => {
        authed();
        const res = await doPut({
            tripWindows: [
                { id: "old", from: "2020-07-31", to: "2020-08-02" },
                { id: "new", from: futureFrom, to: futureTo },
            ],
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { tripWindows: Array<{ id: string }> };
        expect(body.tripWindows.map((w) => w.id)).toEqual(["new"]);
    });

    it("returns 400 for invalid JSON", async () => {
        authed();
        const { PUT } = await import("./route");
        const res = await PUT(
            new Request("https://example.com/api/users/me/trip-windows", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: "not json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when body is missing tripWindows", async () => {
        authed();
        const res = await doPut({ something: "else" });
        expect(res.status).toBe(400);
    });
});
