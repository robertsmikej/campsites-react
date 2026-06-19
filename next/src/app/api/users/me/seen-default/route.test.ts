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

async function doPost(): Promise<Response> {
    const { POST } = await import("./route");
    return POST(new Request("https://example.com/api/users/me/seen-default", { method: "POST" }));
}

describe("POST /api/users/me/seen-default", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const res = await doPost();
        expect(res.status).toBe(401);
    });

    it("bumps defaultSeenAt to now and returns the updated profile", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });

        const kv = createMockKv({
            "user:user@example.com:profile": JSON.stringify({
                email: "user@example.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
                defaultSeenAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { defaultSeenAt: string };
        expect(body.defaultSeenAt > "2026-01-01T00:00:00.000Z").toBe(true);

        const stored = (await kv.get("user:user@example.com:profile", "json")) as {
            defaultSeenAt: string;
        };
        expect(stored.defaultSeenAt).toBe(body.defaultSeenAt);
    });

    it("ignores any client-supplied timestamp and uses the server clock", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "user@example.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:user@example.com:profile": JSON.stringify({
                email: "user@example.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const { POST } = await import("./route");
        const res = await POST(
            new Request("https://example.com/api/users/me/seen-default", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ defaultSeenAt: "2099-01-01T00:00:00.000Z" }),
            }),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { defaultSeenAt: string };
        expect(body.defaultSeenAt < "2099-01-01T00:00:00.000Z").toBe(true);
    });
});
