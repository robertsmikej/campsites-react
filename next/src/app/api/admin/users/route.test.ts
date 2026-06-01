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

async function get(): Promise<Response> {
    const { GET } = await import("./route");
    return GET(new Request("https://example.com/api/admin/users"));
}

async function post(body: unknown): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

function mockCurator(kv = createMockKv()) {
    vi.mocked(sessions.readSession).mockResolvedValue({
        id: "x",
        email: "curator@x.com",
        createdAt: "x",
        expiresAt: "x",
    });
    if (!kv._store.has("user:curator@x.com:profile")) {
        kv._store.set(
            "user:curator@x.com:profile",
            JSON.stringify({ email: "curator@x.com", roles: ["curator"], createdAt: "2026-01-01" }),
        );
    }
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    return kv;
}

describe("GET /api/admin/users", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await get()).status).toBe(401);
    });

    it("returns 403 when signed in but not a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "u@x.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:u@x.com:profile": JSON.stringify({ email: "u@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        expect((await get()).status).toBe(403);
    });

    it("returns 200 with sorted user list for a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "curator@x.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:curator@x.com:profile": JSON.stringify({
                email: "curator@x.com",
                name: "Curator",
                roles: ["curator"],
                createdAt: "2026-01-02T00:00:00.000Z",
            }),
            "user:older@x.com:profile": JSON.stringify({
                email: "older@x.com",
                name: "Older",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:curator@x.com:campgrounds": "{}", // should be filtered out
            "session:abc": "{}", // should be filtered out
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);

        const res = await get();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { users: Array<{ email: string }> };
        expect(body.users.map((u) => u.email)).toEqual(["older@x.com", "curator@x.com"]);
    });
});

describe("POST /api/admin/users", () => {
    it("returns 401 when not signed in", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        expect((await post({ email: "x@y.com" })).status).toBe(401);
    });

    it("returns 403 when signed in but not a curator", async () => {
        vi.mocked(sessions.readSession).mockResolvedValue({
            id: "x",
            email: "u@x.com",
            createdAt: "x",
            expiresAt: "x",
        });
        const kv = createMockKv({
            "user:u@x.com:profile": JSON.stringify({ email: "u@x.com", roles: [] }),
        });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        expect((await post({ email: "x@y.com" })).status).toBe(403);
    });

    it("returns 400 on invalid email", async () => {
        mockCurator();
        expect((await post({ email: "not-an-email" })).status).toBe(400);
    });

    it("returns 400 when email is missing", async () => {
        mockCurator();
        expect((await post({})).status).toBe(400);
    });

    it("creates a profile and clones the default watchlist", async () => {
        const defaultConfig = {
            campgrounds: {
                "recreation.gov": [{ id: "232447", name: "Outlet Campground" }],
            },
            globalSettings: { stayLengths: [2, 3], validStartDays: ["Friday", "Saturday"] },
        };
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify(defaultConfig),
        });
        mockCurator(kv);

        const res = await post({ email: "  NEW@example.COM  ", name: "New Friend" });

        expect(res.status).toBe(201);
        const profile = (await res.json()) as { email: string; name: string };
        expect(profile.email).toBe("new@example.com");
        expect(profile.name).toBe("New Friend");

        const storedProfile = await kv.get("user:new@example.com:profile", "json");
        expect(storedProfile).toMatchObject({ email: "new@example.com", name: "New Friend" });

        const storedCampgrounds = (await kv.get("user:new@example.com:campgrounds", "json")) as {
            campgrounds: { "recreation.gov": Array<{ id: string }> };
        };
        expect(storedCampgrounds.campgrounds["recreation.gov"]).toEqual(
            defaultConfig.campgrounds["recreation.gov"],
        );
    });

    it("falls back to an empty watchlist if no default config is set", async () => {
        const kv = createMockKv();
        mockCurator(kv);

        const res = await post({ email: "fresh@example.com" });

        expect(res.status).toBe(201);
        const storedCampgrounds = (await kv.get("user:fresh@example.com:campgrounds", "json")) as {
            campgrounds: { "recreation.gov": unknown[] };
        };
        expect(storedCampgrounds.campgrounds["recreation.gov"]).toEqual([]);
    });

    it("returns 409 if the user already exists", async () => {
        const kv = createMockKv({
            "user:dup@example.com:profile": JSON.stringify({ email: "dup@example.com" }),
        });
        mockCurator(kv);

        const res = await post({ email: "dup@example.com" });
        expect(res.status).toBe(409);
    });

    it("defaults the name to the email when not provided", async () => {
        const kv = createMockKv();
        mockCurator(kv);

        const res = await post({ email: "noname@example.com" });
        expect(res.status).toBe(201);
        const profile = (await res.json()) as { name: string };
        expect(profile.name).toBe("noname@example.com");
    });
});
