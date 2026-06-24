import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("@/lib/cloudflare", () => ({
    getKv: () => ({
        get: async (k: string, t?: string) =>
            store.has(k) ? (t === "json" ? JSON.parse(store.get(k)!) : store.get(k)!) : null,
        put: async (k: string, v: string) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
    }),
}));

import { readPushSubs, upsertPushSub, removePushSub, isValidSubscription } from "./subscription";

const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: "p", auth: "a" },
    createdAt: "2026-06-24T00:00:00.000Z",
});

beforeEach(() => store.clear());

describe("push subscription store", () => {
    it("upserts and reads back", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        expect(await readPushSubs("me@x.com")).toHaveLength(1);
    });

    it("dedupes by endpoint", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        await upsertPushSub("me@x.com", sub("https://push/1"));
        expect(await readPushSubs("me@x.com")).toHaveLength(1);
    });

    it("removes by endpoint", async () => {
        await upsertPushSub("me@x.com", sub("https://push/1"));
        await upsertPushSub("me@x.com", sub("https://push/2"));
        await removePushSub("me@x.com", "https://push/1");
        const subs = await readPushSubs("me@x.com");
        expect(subs.map((s) => s.endpoint)).toEqual(["https://push/2"]);
    });

    it("validates shape", () => {
        expect(isValidSubscription(sub("https://push/1"))).toBe(true);
        expect(isValidSubscription({ endpoint: "x" })).toBe(false);
        expect(isValidSubscription(null)).toBe(false);
    });
});
