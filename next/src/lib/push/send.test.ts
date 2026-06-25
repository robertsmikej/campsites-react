import { describe, it, expect, vi } from "vitest";

// Mock the crypto-heavy builder: this tests OUR wrapper (fetch + status + gone),
// not pushforge's encryption (which needs real key material).
vi.mock("@pushforge/builder", () => ({
    buildPushHTTPRequest: async ({ subscription }: { subscription: { endpoint: string } }) => ({
        endpoint: subscription.endpoint,
        body: new ArrayBuffer(8),
        headers: { TTL: "900" },
    }),
}));

import { sendWebPush } from "./send";

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" }, createdAt: "x" };
const vapid = {
    subject: "mailto:hello@campwatch.dev",
    privateJWK: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" } as JsonWebKey,
};

describe("sendWebPush", () => {
    it("POSTs to the subscription endpoint and reports status", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.status).toBe(201);
        expect(r.gone).toBe(false);
        expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(sub.endpoint);
    });

    it("flags gone on 410", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.gone).toBe(true);
    });

    it("flags gone on 404", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.gone).toBe(true);
    });
});
