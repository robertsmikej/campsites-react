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

import * as cloudflare from "@/lib/cloudflare";
import * as sessions from "@/lib/sessions";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

async function get(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/admin/users"));
}

describe("GET /api/admin/users", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get()).status).toBe(401);
    });

    it("returns 403 when signed in but not a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "u@x.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:u@x.com:profile": JSON.stringify({ email: "u@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        expect((await get()).status).toBe(403);
    });

    it("returns 200 with sorted user list for a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "curator@x.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({
                email: "curator@x.com",
                name: "Curator",
                roles: ["curator"],
                createdAt: "2026-01-02T00:00:00.000Z",
            }),
            "user:older@x.com:profile": JSON.stringify({
                email: "older@x.com",
                name: "Older",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:curator@x.com:campgrounds": "{}", // should be filtered out
            "session:abc": "{}", // should be filtered out
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { users: Array<{ email: string }> };
        expect(body.users.map((u) => u.email)).toEqual(["older@x.com", "curator@x.com"]);
    });
});
