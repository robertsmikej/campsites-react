import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

const SECRET = "test-api-secret";

async function put(body?: unknown, authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers.Authorization = authHeader;
    const { PUT } = await import("./route");
    return PUT(
        new Request("https://example.com/api/admin/notifier-state", {
            method: "PUT",
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
    );
}

describe("PUT /api/admin/notifier-state", () => {
    it("returns 500 when API_SECRET is unset", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({} as never);
        const res = await put({ updates: [] });
        expect(res.status).toBe(500);
    });

    it("returns 401 with no Bearer header", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ updates: [] });
        expect(res.status).toBe(401);
    });

    it("returns 401 with wrong Bearer value", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ updates: [] }, "Bearer wrong");
        expect(res.status).toBe(401);
    });

    it("returns 400 for invalid JSON body", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const { PUT } = await import("./route");
        const res = await PUT(
            new Request("https://example.com/api/admin/notifier-state", {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
                body: "not-json",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when body has no updates array", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ foo: "bar" }, `Bearer ${SECRET}`);
        expect(res.status).toBe(400);
    });

    // seen within the cooldown regardless of when the test runs.
    const recentIso = new Date(Date.now() - 60_000).toISOString();

    it("merges notifier state and patches lastNotifiedAt for two updates", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:alice@x.com:profile": JSON.stringify({
                email: "alice@x.com",
                name: "Alice",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:bob@x.com:profile": JSON.stringify({
                email: "bob@x.com",
                name: "Bob",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await put(
            {
                updates: [
                    {
                        email: "alice@x.com",
                        state: {
                            sites: { "100:1": [{ from: "2026-07-16", to: "2026-07-19", seen: recentIso }] },
                        },
                        lastNotifiedAt: "2026-05-15T01:00:00.000Z",
                    },
                    {
                        email: "bob@x.com",
                        state: {
                            sites: { "200:2": [{ from: "2026-08-01", to: "2026-08-03", seen: recentIso }] },
                        },
                        // no lastNotifiedAt
                    },
                ],
            },
            `Bearer ${SECRET}`,
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { updated: number };
        expect(body.updated).toBe(2);

        // Alice's notifier state written (normalized to { sites })
        const aliceState = await kv.get("user:alice@x.com:notifier-state", "json");
        expect(aliceState).toEqual({
            sites: { "100:1": [{ from: "2026-07-16", to: "2026-07-19", seen: recentIso }] },
        });

        // Alice's profile patched with lastNotifiedAt
        const aliceProfile = (await kv.get("user:alice@x.com:profile", "json")) as {
            lastNotifiedAt?: string;
        };
        expect(aliceProfile.lastNotifiedAt).toBe("2026-05-15T01:00:00.000Z");

        // Bob's notifier state written
        const bobState = await kv.get("user:bob@x.com:notifier-state", "json");
        expect(bobState).toEqual({
            sites: { "200:2": [{ from: "2026-08-01", to: "2026-08-03", seen: recentIso }] },
        });

        // Bob's profile not touched (no lastNotifiedAt in update)
        const bobProfile = (await kv.get("user:bob@x.com:profile", "json")) as { lastNotifiedAt?: string };
        expect(bobProfile.lastNotifiedAt).toBeUndefined();
    });

    it("does not erase a stored site the incoming update omits (overlapping-cron clobber)", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            // Bull Trout (232431) was alerted by a prior run and recorded here.
            "user:mike@x.com:notifier-state": JSON.stringify({
                sites: {
                    "232431:18649": [{ from: "2026-07-16", to: "2026-07-19", seen: recentIso }],
                    "232085:53676": [{ from: "2026-06-22", to: "2026-06-28", seen: recentIso }],
                },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        // A stale, overlapping run recomputes state without Bull Trout (it didn't
        // re-fetch it this cycle) and writes last. It must not clobber the range.
        const res = await put(
            {
                updates: [
                    {
                        email: "mike@x.com",
                        state: {
                            sites: {
                                "232085:53676": [{ from: "2026-06-22", to: "2026-06-28", seen: recentIso }],
                            },
                        },
                    },
                ],
            },
            `Bearer ${SECRET}`,
        );
        expect(res.status).toBe(200);

        const state = (await kv.get("user:mike@x.com:notifier-state", "json")) as {
            sites: Record<string, unknown>;
        };
        expect(state.sites["232431:18649"]).toEqual([
            { from: "2026-07-16", to: "2026-07-19", seen: recentIso },
        ]);
        expect(state.sites["232085:53676"]).toBeDefined();
    });

    it("never moves lastNotifiedAt backward", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:c@x.com:profile": JSON.stringify({
                email: "c@x.com",
                name: "C",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
                lastNotifiedAt: "2026-06-18T13:20:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        // Stale run reports an older lastNotifiedAt — must be ignored.
        await put(
            {
                updates: [
                    { email: "c@x.com", state: { sites: {} }, lastNotifiedAt: "2026-06-18T13:15:00.000Z" },
                ],
            },
            `Bearer ${SECRET}`,
        );

        const profile = (await kv.get("user:c@x.com:profile", "json")) as { lastNotifiedAt?: string };
        expect(profile.lastNotifiedAt).toBe("2026-06-18T13:20:00.000Z");
    });

    it("returns updated: 0 for empty updates array", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const res = await put({ updates: [] }, `Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { updated: number };
        expect(body.updated).toBe(0);
    });
});
