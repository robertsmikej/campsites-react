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

    it("writes notifier state and patches lastNotifiedAt for two updates", async () => {
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
                        state: { signatures: ["sig1"] },
                        lastNotifiedAt: "2026-05-15T01:00:00.000Z",
                    },
                    {
                        email: "bob@x.com",
                        state: { signatures: ["sig2"] },
                        // no lastNotifiedAt
                    },
                ],
            },
            `Bearer ${SECRET}`,
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { updated: number };
        expect(body.updated).toBe(2);

        // Alice's notifier state written
        const aliceState = await kv.get("user:alice@x.com:notifier-state", "json");
        expect(aliceState).toEqual({ signatures: ["sig1"] });

        // Alice's profile patched with lastNotifiedAt
        const aliceProfile = (await kv.get("user:alice@x.com:profile", "json")) as {
            lastNotifiedAt?: string;
        };
        expect(aliceProfile.lastNotifiedAt).toBe("2026-05-15T01:00:00.000Z");

        // Bob's notifier state written
        const bobState = await kv.get("user:bob@x.com:notifier-state", "json");
        expect(bobState).toEqual({ signatures: ["sig2"] });

        // Bob's profile not touched (no lastNotifiedAt in update)
        const bobProfile = (await kv.get("user:bob@x.com:profile", "json")) as { lastNotifiedAt?: string };
        expect(bobProfile.lastNotifiedAt).toBeUndefined();
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
