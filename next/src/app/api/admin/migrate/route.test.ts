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
    vi.clearAllMocks();
});

const CURATOR = "boss@example.com";

function wire(kv: ReturnType<typeof createMockKv>) {
    vi.mocked(cloudflare.getKv).mockReturnValue(kv);
    vi.mocked(cloudflare.getEnv).mockReturnValue({
        BOOTSTRAP_ADMIN_EMAIL: CURATOR,
        API_SECRET: "secret",
        SUBSCRIBERS: kv,
    } as never);
    vi.mocked(sessions.readSession).mockResolvedValue(null);
}

function cg(id: string, stayLengths?: number[]) {
    const base = { id, name: `Camp ${id}`, sites: { favorites: [], worthwhile: [] } };
    return stayLengths ? { ...base, stayLengths } : base;
}

function seedCurator(kv: ReturnType<typeof createMockKv>) {
    kv._store.set(
        `user:${CURATOR}:profile`,
        JSON.stringify({ email: CURATOR, name: "Boss", roles: ["curator"], createdAt: "2024-01-01" }),
    );
}

async function doPost(): Promise<Response> {
    const { POST } = await import("./route");
    return POST(
        new Request("https://example.com/api/admin/migrate", {
            method: "POST",
            headers: { Authorization: "Bearer secret" },
        }),
    );
}

describe("POST /api/admin/migrate (reconcile)", () => {
    it("rejects unauthorized callers", async () => {
        const kv = createMockKv({});
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: "secret", SUBSCRIBERS: kv } as never);
        vi.mocked(sessions.readSession).mockResolvedValue(null);
        const { POST } = await import("./route");
        const res = await POST(new Request("https://example.com/api/admin/migrate", { method: "POST" }));
        expect(res.status).toBe(401);
    });

    it("merges config into the curator record (curator wins) and deletes the key", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [cg("A"), cg("B", [9])] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
            [`user:${CURATOR}:campgrounds`]: JSON.stringify({
                campgrounds: { "recreation.gov": [cg("B", [3]), cg("C")] },
                globalSettings: { stayLengths: [4, 5], validStartDays: ["Saturday"] },
                updatedAt: "2024-01-02",
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            reconciled: boolean;
            owner: string;
            merged: number;
            addedFromConfig: { id: string }[];
            configKeyDeleted: boolean;
        };
        expect(body.reconciled).toBe(true);
        expect(body.owner).toBe(CURATOR);
        expect(body.addedFromConfig.map((c) => c.id)).toEqual(["A"]);
        expect(body.configKeyDeleted).toBe(true);

        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string; stayLengths?: number[] }[] };
            globalSettings: { stayLengths: number[] };
        };
        const list = stored.campgrounds["recreation.gov"];
        expect(list.map((c) => c.id)).toEqual(["B", "C", "A"]); // curator order first, config-only appended
        expect(list.find((c) => c.id === "B")!.stayLengths).toEqual([3]); // curator entry wins
        expect(stored.globalSettings.stayLengths).toEqual([4, 5]); // curator settings win
        expect(kv._store.get("config:campgrounds")).toBeUndefined();
    });

    it("seeds the curator record from config when the record is missing", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [cg("A")] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string }[] };
        };
        expect(stored.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["A"]);
        expect(kv._store.get("config:campgrounds")).toBeUndefined();
    });

    it("is a no-op on re-run once the config key is gone", async () => {
        const kv = createMockKv({
            [`user:${CURATOR}:campgrounds`]: JSON.stringify({
                campgrounds: { "recreation.gov": [cg("C")] },
                globalSettings: { stayLengths: [4], validStartDays: ["Saturday"] },
                updatedAt: "2024-01-02",
            }),
        });
        seedCurator(kv);
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { reconciled: boolean };
        expect(body.reconciled).toBe(false);
        const stored = JSON.parse(kv._store.get(`user:${CURATOR}:campgrounds`)!) as {
            campgrounds: { "recreation.gov": { id: string }[] };
        };
        expect(stored.campgrounds["recreation.gov"].map((c) => c.id)).toEqual(["C"]); // untouched
    });

    it("returns 409 and preserves the legacy key when there is no curator", async () => {
        const kv = createMockKv({
            "config:campgrounds": JSON.stringify({
                campgrounds: { "recreation.gov": [cg("A")] },
                globalSettings: { stayLengths: [2], validStartDays: ["Friday"] },
            }),
        });
        // No curator profile seeded -> resolveDefaultOwnerEmail() returns null.
        wire(kv);

        const res = await doPost();
        expect(res.status).toBe(409);
        // Legacy key is preserved so a later run (after a curator exists) can still reconcile.
        expect(kv._store.get("config:campgrounds")).toBeDefined();
    });
});
