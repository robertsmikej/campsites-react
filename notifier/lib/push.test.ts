import { describe, it, expect, vi } from "vitest";

// Mock the crypto-heavy builder: this tests the wrapper (fetch + status + gone),
// not pushforge's encryption. Mirrors next/src/lib/push/send.test.ts since the
// notifier keeps its own copy of the wrapper (see lib/push.ts for why).
vi.mock("@pushforge/builder", () => ({
    buildPushHTTPRequest: async ({ subscription }: { subscription: { endpoint: string } }) => ({
        endpoint: subscription.endpoint,
        body: new ArrayBuffer(8),
        headers: { TTL: "900" },
    }),
}));

import { sendWebPush } from "./push";

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" }, createdAt: "x" };
const vapid = {
    subject: "mailto:hello@campwatch.dev",
    privateJWK: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" } as JsonWebKey,
};

describe("sendWebPush (notifier copy)", () => {
    it("POSTs to the subscription endpoint and reports status", async () => {
        const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
        const r = await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, fetchImpl);
        expect(r.status).toBe(201);
        expect(r.gone).toBe(false);
    });

    it("flags gone on 410 and 404", async () => {
        const f410 = vi.fn(async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
        const f404 = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
        expect((await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, f410)).gone).toBe(true);
        expect((await sendWebPush(sub, { title: "T", body: "B", url: "/app" }, vapid, f404)).gone).toBe(true);
    });
});
