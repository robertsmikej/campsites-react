import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RestKvAdapter } from "./rest-kv";

describe("RestKvAdapter", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    const adapter = new RestKvAdapter({
        accountId: "acc-123",
        namespaceId: "ns-456",
        apiToken: "tok-xyz",
    });

    it("putRaw PUTs after a GET miss, with the 1-hour TTL", async () => {
        // 1st call: GET for the existing value (cache miss). 2nd: the PUT.
        fetchSpy
            .mockResolvedValueOnce(new Response("not found", { status: 404 }))
            .mockResolvedValueOnce(new Response("{}", { status: 200 }));
        await adapter.putRaw("232358", "2026-07", { campsites: {} });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const [url, init] = fetchSpy.mock.calls[1] ?? [];
        expect(url).toContain(
            "/accounts/acc-123/storage/kv/namespaces/ns-456/values/recgov%3A232358%3A2026-07",
        );
        expect(url).toContain("expiration_ttl=3600");
        expect((init as RequestInit).method).toBe("PUT");
        expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
            "Bearer tok-xyz",
        );
    });

    it("putRaw skips the PUT when the existing value is identical", async () => {
        const same = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(same), { status: 200 }));
        await adapter.putRaw("232358", "2026-07", same);
        expect(fetchSpy).toHaveBeenCalledTimes(1); // GET only — no PUT
    });

    it("getRaw returns null on 404", async () => {
        fetchSpy.mockResolvedValue(new Response("not found", { status: 404 }));
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toBeNull();
    });

    it("getRaw returns parsed JSON on 200", async () => {
        const body = { campsites: { "1": { site: "001", campsite_type: "STANDARD", availabilities: {} } } };
        fetchSpy.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
        const result = await adapter.getRaw("232358", "2026-07");
        expect(result).toEqual(body);
    });

    it("putSnapshot uses 180s TTL and snapshot:{email} key", async () => {
        // GET miss, then PUT.
        fetchSpy
            .mockResolvedValueOnce(new Response("not found", { status: 404 }))
            .mockResolvedValueOnce(new Response("{}", { status: 200 }));
        await adapter.putSnapshot("alice@example.com", { updatedAt: "now", campgrounds: [] });
        const [url] = fetchSpy.mock.calls[1] ?? [];
        expect(url).toContain("snapshot%3Aalice%40example.com");
        expect(url).toContain("expiration_ttl=180");
    });

    it("putSnapshot skips the PUT when content is identical (ignoring updatedAt)", async () => {
        const existing = { updatedAt: "2026-05-29T10:00:00Z", campgrounds: [] };
        const fresh = { updatedAt: "2026-05-29T10:05:00Z", campgrounds: [] };
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(existing), { status: 200 }));
        await adapter.putSnapshot("alice@example.com", fresh);
        expect(fetchSpy).toHaveBeenCalledTimes(1); // GET only
    });

    it("throws on non-2xx PUT response", async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response("not found", { status: 404 }))
            .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
        await expect(adapter.putRaw("232358", "2026-07", { campsites: {} })).rejects.toThrow(/403/);
    });
});
