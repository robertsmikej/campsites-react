import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getKv: vi.fn(),
    getEnv: vi.fn(),
}));

async function post(body: unknown): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: typeof body === "string" ? body : JSON.stringify(body),
        }),
    );
}

beforeEach(() => {
    vi.resetModules();
});

describe("POST /api/subscribe", () => {
    it("stores a new email and returns success", async () => {
        const kv = createMockKv();
        const { getKv } = await import("@/lib/cloudflare");
        vi.mocked(getKv).mockReturnValue(kv);

        const res = await post({ email: "USER@example.com" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: "Subscribed successfully" });

        const stored = await kv.get("email:user@example.com", "json");
        expect(stored).toMatchObject({ email: "user@example.com" });
        expect(typeof (stored as { subscribedAt: string }).subscribedAt).toBe("string");
    });

    it("is idempotent for an already-subscribed email", async () => {
        const kv = createMockKv({
            "email:user@example.com": JSON.stringify({
                email: "user@example.com",
                subscribedAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        const { getKv } = await import("@/lib/cloudflare");
        vi.mocked(getKv).mockReturnValue(kv);

        const res = await post({ email: "user@example.com" });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: "Already subscribed" });
    });

    it("rejects invalid emails", async () => {
        const kv = createMockKv();
        const { getKv } = await import("@/lib/cloudflare");
        vi.mocked(getKv).mockReturnValue(kv);

        const res = await post({ email: "not-an-email" });

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Valid email address required" });
    });

    it("rejects an unparseable body", async () => {
        const { getKv } = await import("@/lib/cloudflare");
        vi.mocked(getKv).mockReturnValue(createMockKv());

        const res = await post("not json");

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "Invalid request body" });
    });
});
