import { describe, it, expect } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";

describe("createMockKv", () => {
    it("supports get/put/delete round-trips with json mode", async () => {
        const kv = createMockKv();
        await kv.put("foo", JSON.stringify({ hello: "world" }));
        const value = await kv.get("foo", "json");
        expect(value).toEqual({ hello: "world" });
        await kv.delete("foo");
        expect(await kv.get("foo")).toBeNull();
    });

    it("lists keys with a prefix", async () => {
        const kv = createMockKv();
        await kv.put("email:a@x.com", "x");
        await kv.put("email:b@x.com", "y");
        await kv.put("config:default", "z");
        const result = await kv.list({ prefix: "email:" });
        expect(result.keys.map((k) => k.name).sort()).toEqual([
            "email:a@x.com",
            "email:b@x.com",
        ]);
    });
});
