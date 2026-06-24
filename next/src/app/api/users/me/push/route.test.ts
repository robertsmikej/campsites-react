import { describe, it, expect, vi, beforeEach } from "vitest";

let session: { email: string } | null = { email: "me@x.com" };
vi.mock("@/lib/sessions", () => ({ readSession: async () => session }));

const calls: { upsert: unknown[]; remove: unknown[] } = { upsert: [], remove: [] };
vi.mock("@/lib/push/subscription", async (orig) => {
    const actual = await orig<typeof import("@/lib/push/subscription")>();
    return {
        ...actual,
        upsertPushSub: async (...a: unknown[]) => void calls.upsert.push(a),
        removePushSub: async (...a: unknown[]) => void calls.remove.push(a),
    };
});

import { POST, DELETE } from "./route";

const sub = { endpoint: "https://push/1", keys: { p256dh: "p", auth: "a" } };
const postReq = (body: unknown) =>
    new Request("https://x/api/users/me/push", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
    session = { email: "me@x.com" };
    calls.upsert = [];
    calls.remove = [];
});

describe("POST /api/users/me/push", () => {
    it("stores a valid subscription for the session user", async () => {
        const res = await POST(postReq(sub));
        expect(res.status).toBe(200);
        expect(calls.upsert).toHaveLength(1);
        expect((calls.upsert[0] as unknown[])[0]).toBe("me@x.com");
    });

    it("401s when unauthenticated", async () => {
        session = null;
        expect((await POST(postReq(sub))).status).toBe(401);
    });

    it("400s on a malformed body", async () => {
        expect((await POST(postReq({ endpoint: "x" }))).status).toBe(400);
    });
});

describe("DELETE /api/users/me/push", () => {
    it("removes by endpoint", async () => {
        const req = new Request("https://x", { method: "DELETE", body: JSON.stringify({ endpoint: "https://push/1" }) });
        expect((await DELETE(req)).status).toBe(200);
        expect(calls.remove).toHaveLength(1);
    });
});
