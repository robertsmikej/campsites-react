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

async function put(email: string, body: unknown, contextEmail?: string): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request(`https://example.com/api/admin/users/${encodeURIComponent(email)}/roles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ email: contextEmail ?? encodeURIComponent(email) }) },
    );
}

async function putRaw(email: string, rawBody: string, contextEmail?: string): Promise<Response> {
    const { PUT } = await import("./route");
    return PUT(
        new Request(`https://example.com/api/admin/users/${encodeURIComponent(email)}/roles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: rawBody,
        }),
        { params: Promise.resolve({ email: contextEmail ?? encodeURIComponent(email) }) },
    );
}

describe("PUT /api/admin/users/[email]/roles", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await put("target@x.com", { roles: [] })).status).toBe(401);
    });

    it("returns 403 when signed in but not a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({ email: "user@x.com", roles: [] }),
            "user:target@x.com:profile": JSON.stringify({ email: "target@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        expect((await put("target@x.com", { roles: [] })).status).toBe(403);
    });

    it("returns 400 on invalid JSON body", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await putRaw("target@x.com", "not-json{{{");
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Invalid JSON");
    });

    it("returns 400 when roles is missing", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("target@x.com", {});
        expect(res.status).toBe(400);
    });

    it("returns 400 when roles contains an invalid string", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("target@x.com", { roles: ["admin"] });
        expect(res.status).toBe(400);
    });

    it("returns 400 when roles is not an array", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("target@x.com", { roles: "curator" });
        expect(res.status).toBe(400);
    });

    it("returns 404 when target user does not exist", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("ghost@x.com", { roles: [] });
        expect(res.status).toBe(404);
    });

    it("returns 400 when attempting to remove the last curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("curator@x.com", { roles: [] });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("Cannot remove the last curator");
    });

    it("returns 200 with updated profile when granting curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
            "user:newuser@x.com:profile": JSON.stringify({ email: "newuser@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("newuser@x.com", { roles: ["curator"] });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { email: string; roles: string[] };
        expect(body.email).toBe("newuser@x.com");
        expect(body.roles).toEqual(["curator"]);
    });

    it("returns 200 when revoking curator from one of multiple curators", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator1@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator1@x.com:profile": JSON.stringify({ email: "curator1@x.com", roles: ["curator"] }),
            "user:curator2@x.com:profile": JSON.stringify({ email: "curator2@x.com", roles: ["curator"] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const res = await put("curator2@x.com", { roles: [] });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { email: string; roles: string[] };
        expect(body.email).toBe("curator2@x.com");
        expect(body.roles).toEqual([]);
    });

    it("URL-decodes an email with special characters", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({ email: "curator@x.com", roles: ["curator"] }),
            "user:target+tag@x.com:profile": JSON.stringify({ email: "target+tag@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        // Pass URL-encoded email as both URL path param and context param
        const encoded = encodeURIComponent("target+tag@x.com");
        const res = await put("target+tag@x.com", { roles: ["curator"] }, encoded);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { email: string };
        expect(body.email).toBe("target+tag@x.com");
    });
});
