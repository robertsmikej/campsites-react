import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

const SECRET = "test-api-secret";

async function post(authHeader?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const { POST } = await import("./route");
    return POST(new Request("https://example.com/api/admin/migrate", { method: "POST", headers }));
}

describe("POST /api/admin/migrate", () => {
    it("returns 500 when API_SECRET is unset", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({} as never);
        const res = await post(`Bearer ${SECRET}`);
        expect(res.status).toBe(500);
    });

    it("returns 401 without auth", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await post()).status).toBe(401);
    });

    it("returns 401 with wrong Bearer", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await post("Bearer wrong")).status).toBe(401);
    });

    it("adds the 3 seed campgrounds when KV is empty", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { defaultUpdated: boolean; addedCampgrounds: Array<{ id: string }> };
        expect(body.defaultUpdated).toBe(true);
        expect(body.addedCampgrounds.map((c) => c.id).sort()).toEqual(["232312", "233128", "233881"]);

        const stored = (await kv.get("config:campgrounds", "json")) as { campgrounds: { "recreation.gov": Array<{ id: string }> } };
        const ids = stored.campgrounds["recreation.gov"].map((c) => c.id);
        expect(ids).toContain("232312");
        expect(ids).toContain("233881");
        expect(ids).toContain("233128");
    });

    it("does not duplicate when all 3 seeds are already present", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        { id: "232312", name: "Pine Flats", sites: { favorites: [], worthwhile: [] } },
                        { id: "233881", name: "Deadwood Lookout", sites: { favorites: [], worthwhile: [] } },
                        { id: "233128", name: "Lookout Butte", sites: { favorites: [], worthwhile: [] } },
                    ],
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as { defaultUpdated: boolean; addedCampgrounds: unknown[] };
        expect(body.defaultUpdated).toBe(false);
        expect(body.addedCampgrounds).toEqual([]);
    });

    it("appends only the seeds that aren't present yet", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: {
                    "recreation.gov": [
                        { id: "232358", name: "Outlet", sites: { favorites: [], worthwhile: [] } },
                        { id: "232312", name: "Pine Flats", sites: { favorites: [], worthwhile: [] } },
                    ],
                },
                globalSettings: { stayLengths: [2], validStartDays: ["Monday"] },
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as { addedCampgrounds: Array<{ id: string }> };
        expect(body.addedCampgrounds.map((c) => c.id).sort()).toEqual(["233128", "233881"]);
    });

    it("wipes email:* records", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "email:a@x.com": JSON.stringify({ email: "a@x.com" }),
            "email:b@x.com": JSON.stringify({ email: "b@x.com" }),
            "email:c@x.com": JSON.stringify({ email: "c@x.com" }),
            "user:keep@x.com:profile": "{}",
            "config:campgrounds": JSON.stringify({ campgrounds: { "recreation.gov": [] } }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await post(`Bearer ${SECRET}`);
        const body = (await res.json()) as { emailsDeleted: number };
        expect(body.emailsDeleted).toBe(3);

        expect(await kv.get("email:a@x.com")).toBeNull();
        expect(await kv.get("email:b@x.com")).toBeNull();
        expect(await kv.get("email:c@x.com")).toBeNull();
        expect(await kv.get("user:keep@x.com:profile")).not.toBeNull();
    });
});
