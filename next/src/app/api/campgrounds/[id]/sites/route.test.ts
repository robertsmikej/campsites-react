import { it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({ getKv: vi.fn(), getEnv: vi.fn() }));
import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => vi.restoreAllMocks());

async function doGet(id: string): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request(`https://x/api/campgrounds/${id}/sites`), {
        params: Promise.resolve({ id }),
    });
}

it("returns sorted site labels from rec.gov on a cache miss and caches them", async () => {
    const kv = createMockKv();
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
            JSON.stringify({
                campsites: [{ name: "003" }, { name: "001" }, { name: "002" }, { name: "" }],
            }),
            { status: 200 },
        ),
    );

    const res = await doGet("234007");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sites: string[] }).sites).toEqual(["001", "002", "003"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await kv.get("sites:234007", "json")).toEqual(["001", "002", "003"]);
});

it("serves from cache without calling rec.gov on a hit", async () => {
    const kv = createMockKv({ "sites:234007": JSON.stringify(["001", "002"]) });
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await doGet("234007");
    expect(((await res.json()) as { sites: string[] }).sites).toEqual(["001", "002"]);
    expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects a non-numeric id", async () => {
    vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
    const res = await doGet("abc");
    expect(res.status).toBe(400);
});
