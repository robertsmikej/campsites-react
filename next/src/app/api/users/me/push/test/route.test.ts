import { describe, it, expect, vi, beforeEach } from "vitest";

let session: { email: string } | null = { email: "me@x.com" };
vi.mock("@/lib/sessions", () => ({ readSession: async () => session }));

let vapidJwk: string | undefined = '{"kty":"EC","crv":"P-256","x":"x","y":"y","d":"d"}';
vi.mock("@/lib/cloudflare", () => ({ getEnv: () => ({ VAPID_PRIVATE_JWK: vapidJwk }) }));

let subs: Array<{ endpoint: string; keys: { p256dh: string; auth: string }; createdAt: string }> = [];
const removed: string[] = [];
vi.mock("@/lib/push/subscription", () => ({
    readPushSubs: async () => subs,
    removePushSub: async (_e: string, endpoint: string) => void removed.push(endpoint),
}));

const sendResults: Array<{ status: number; gone: boolean }> = [];
let sendIdx = 0;
vi.mock("@/lib/push/send", () => ({
    sendWebPush: async (s: { endpoint: string }) => {
        const r = sendResults[sendIdx++] ?? { status: 201, gone: false };
        return { endpoint: s.endpoint, ...r };
    },
}));

import { POST } from "./route";

const sub = (e: string) => ({ endpoint: e, keys: { p256dh: "p", auth: "a" }, createdAt: "x" });
const req = () => new Request("https://x/api/users/me/push/test", { method: "POST" });

beforeEach(() => {
    session = { email: "me@x.com" };
    vapidJwk = '{"kty":"EC","crv":"P-256","x":"x","y":"y","d":"d"}';
    subs = [];
    removed.length = 0;
    sendResults.length = 0;
    sendIdx = 0;
});

describe("POST /api/users/me/push/test", () => {
    it("401s when unauthenticated", async () => {
        session = null;
        expect((await POST(req())).status).toBe(401);
    });

    it("503s when VAPID isn't configured", async () => {
        vapidJwk = undefined;
        expect((await POST(req())).status).toBe(503);
    });

    it("404s when the account has no subscriptions", async () => {
        subs = [];
        expect((await POST(req())).status).toBe(404);
    });

    it("sends to each subscription and reports the count", async () => {
        subs = [sub("https://push/1"), sub("https://push/2")];
        const res = await POST(req());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true, sent: 2, pruned: 0 });
    });

    it("prunes subscriptions the push service reports as gone", async () => {
        subs = [sub("https://push/1"), sub("https://push/2")];
        sendResults.push({ status: 201, gone: false }, { status: 410, gone: true });
        const res = await POST(req());
        expect(await res.json()).toMatchObject({ ok: true, sent: 1, pruned: 1 });
        expect(removed).toEqual(["https://push/2"]);
    });
});
