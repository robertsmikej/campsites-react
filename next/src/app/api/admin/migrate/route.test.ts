import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));
vi.mock("@/lib/sessions", () => ({
    readSession: vi.fn(),
    SESSION_COOKIE: "campwatch_session",
}));

import * as cloudflare from "@/lib/cloudflare";
import * as sessions from "@/lib/sessions";

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
    it("returns 401 without any auth", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        expect((await post()).status).toBe(401);
    });

    it("returns 401 with wrong Bearer and no session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        expect((await post("Bearer wrong")).status).toBe(401);
    });

    it("returns 401 with a signed-in non-curator session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:user@x.com:profile": JSON.stringify({ email: "user@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "user@x.com", createdAt: "x", expiresAt: "x",
        });
        expect((await post()).status).toBe(401);
    });

    it("accepts a curator session", async () => {
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: SECRET } as never);
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({
                email: "curator@x.com",
                roles: ["curator"],
            }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x", email: "curator@x.com", createdAt: "x", expiresAt: "x",
        });
        const res = await post();
        expect(res.status).toBe(200);
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
