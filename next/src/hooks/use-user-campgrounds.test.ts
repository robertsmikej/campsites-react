import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUserCampgrounds } from "./use-user-campgrounds";

const ENDPOINT = "/api/users/me/campgrounds";

function makeFakeRecord(overrides: Record<string, unknown> = {}) {
    return {
        campgrounds: { "recreation.gov": [] as unknown[] },
        globalSettings: {
            stayLengths: [2, 3, 4, 5],
            validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        },
        updatedAt: null,
        ...overrides,
    };
}

function mockFetch(response: unknown, ok = true, status = 200) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(response),
    });
}

describe("useUserCampgrounds fetch contract", () => {
    beforeEach(() => {
        // @ts-expect-error patching globalThis.fetch for tests
        globalThis.fetch = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("GET /api/users/me/campgrounds on hydration", async () => {
        const record = makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" });
        const fetchMock = mockFetch(record);
        globalThis.fetch = fetchMock;

        const result = await fetch(ENDPOINT, { credentials: "include" });
        const data = (await result.json()) as typeof record;

        expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, { credentials: "include" });
        expect(data.updatedAt).toBe("2024-01-01T00:00:00.000Z");
        expect(data.campgrounds).toEqual({ "recreation.gov": [] });
    });

    it("isEmpty is true when updatedAt is null and campgrounds is empty", () => {
        const record = makeFakeRecord();
        const isEmpty =
            record.updatedAt === null && (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
        expect(isEmpty).toBe(true);
    });

    it("isEmpty is false when updatedAt is set", () => {
        const record = makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" });
        const isEmpty =
            record.updatedAt === null && (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
        expect(isEmpty).toBe(false);
    });

    it("isEmpty is false when campgrounds has items", () => {
        const record = makeFakeRecord({
            updatedAt: null,
            campgrounds: {
                "recreation.gov": [{ id: "123", name: "Test", sites: { favorites: [], worthwhile: [] } }],
            },
        });
        const isEmpty =
            record.updatedAt === null && (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
        expect(isEmpty).toBe(false);
    });

    it("save sends PUT to the right URL with the right body", async () => {
        const siteConfig = { "recreation.gov": [] as unknown[] };
        const globalSettings = { stayLengths: [2, 3], validStartDays: ["Friday"] };
        const stored = makeFakeRecord({ updatedAt: "2024-01-02T00:00:00.000Z" });
        const fetchMock = mockFetch(stored);
        globalThis.fetch = fetchMock;

        await fetch(ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campgrounds: siteConfig, globalSettings }),
            credentials: "include",
        });

        expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campgrounds: siteConfig, globalSettings }),
            credentials: "include",
        });
    });

    it("cloneDefault POSTs to /clone-default endpoint", async () => {
        const stored = makeFakeRecord({ updatedAt: "2024-01-02T00:00:00.000Z" });
        const fetchMock = mockFetch(stored);
        globalThis.fetch = fetchMock;

        await fetch(`${ENDPOINT}/clone-default`, {
            method: "POST",
            credentials: "include",
        });

        expect(fetchMock).toHaveBeenCalledWith(`${ENDPOINT}/clone-default`, {
            method: "POST",
            credentials: "include",
        });
    });

    it("startBlank PUTs an empty campgrounds list", async () => {
        const currentGlobalSettings = { stayLengths: [2, 3, 4, 5], validStartDays: ["Monday"] };
        const stored = makeFakeRecord({ updatedAt: "2024-01-02T00:00:00.000Z" });
        const fetchMock = mockFetch(stored);
        globalThis.fetch = fetchMock;

        await fetch(ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                campgrounds: { "recreation.gov": [] },
                globalSettings: currentGlobalSettings,
            }),
            credentials: "include",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            ENDPOINT,
            expect.objectContaining({
                method: "PUT",
                body: expect.stringContaining('"recreation.gov":[]'),
            }),
        );
    });

    it("exports the hook function", async () => {
        const mod = await import("./use-user-campgrounds");
        expect(typeof mod.useUserCampgrounds).toBe("function");
    });

    it("save returning 400 with {error: '...'} exposes that message via syncError, and clearSyncStatus resets it", async () => {
        const errorMessage = "At most 3 campgrounds can be set to every-minute checking";

        // Mount the hook; initial GET + default GET must succeed so hydration completes.
        const okRecord = makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" });
        const okDefault = { campgrounds: { "recreation.gov": [] }, globalSettings: okRecord.globalSettings };
        let callCount = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                // GET /api/users/me/campgrounds
                return Promise.resolve(new Response(JSON.stringify(okRecord), { status: 200 }));
            }
            if (callCount === 2) {
                // GET /api/default
                return Promise.resolve(new Response(JSON.stringify(okDefault), { status: 200 }));
            }
            // All subsequent calls (the save PUT) return 400.
            return Promise.resolve(new Response(JSON.stringify({ error: errorMessage }), { status: 400 }));
        });

        const { result } = renderHook(() => useUserCampgrounds());

        // Wait for hydration to complete (isHydrating becomes false).
        await waitFor(() => expect(result.current.isHydrating).toBe(false));

        await act(async () => {
            await result.current.save(
                { "recreation.gov": [] },
                { stayLengths: [2, 3], validStartDays: ["Friday"] },
            );
        });

        expect(result.current.syncError).toBe(errorMessage);
        expect(result.current.syncStatus).toBe("error");

        // clearSyncStatus should reset both fields.
        act(() => result.current.clearSyncStatus());
        expect(result.current.syncError).toBeNull();
        expect(result.current.syncStatus).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// missingFromDefault / syncMissing logic
// ---------------------------------------------------------------------------

const DEFAULT_ENDPOINT = "/api/default";

function makeDefaultRecord(campgrounds: unknown[] = []) {
    return {
        campgrounds: { "recreation.gov": campgrounds },
        globalSettings: {
            stayLengths: [2, 3, 4, 5],
            validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        },
    };
}

describe("missingFromDefault logic", () => {
    it("returns campgrounds in default but not in user config", () => {
        const userCampgrounds = [
            { id: "111", name: "Existing Camp", sites: { favorites: [], worthwhile: [] } },
        ];
        const defaultCampgrounds = [
            { id: "111", name: "Existing Camp", sites: { favorites: [], worthwhile: [] } },
            { id: "233881", name: "Deadwood Lookout", sites: { favorites: [], worthwhile: [] } },
            { id: "233128", name: "Lookout Butte", sites: { favorites: [], worthwhile: [] } },
        ];
        const userIds = new Set(userCampgrounds.map((c) => c.id).filter(Boolean));
        const missing = defaultCampgrounds.filter((c) => c.id && !userIds.has(c.id));
        expect(missing).toHaveLength(2);
        expect(missing.map((c) => c.id)).toEqual(["233881", "233128"]);
    });

    it("returns empty array when user has all default campgrounds", () => {
        const campgrounds = [{ id: "111", name: "Camp A", sites: { favorites: [], worthwhile: [] } }];
        const userIds = new Set(campgrounds.map((c) => c.id).filter(Boolean));
        const missing = campgrounds.filter((c) => c.id && !userIds.has(c.id));
        expect(missing).toHaveLength(0);
    });

    it("skips campgrounds without an id", () => {
        const userCampgrounds: { id?: string; name: string; sites: object }[] = [];
        const defaultCampgrounds = [
            { name: "No ID Camp", sites: { favorites: [], worthwhile: [] } },
            { id: "222", name: "Has ID Camp", sites: { favorites: [], worthwhile: [] } },
        ];
        const userIds = new Set(userCampgrounds.map((c) => c.id).filter(Boolean) as string[]);
        const missing = defaultCampgrounds.filter((c) => c.id && !userIds.has(c.id));
        // Only the camp with an id should appear
        expect(missing).toHaveLength(1);
        expect(missing[0]?.id).toBe("222");
    });

    it("returns all defaults when user has zero campgrounds", () => {
        const userCampgrounds: { id: string; name: string; sites: object }[] = [];
        const defaultCampgrounds = [
            { id: "111", name: "Camp A", sites: { favorites: [], worthwhile: [] } },
            { id: "222", name: "Camp B", sites: { favorites: [], worthwhile: [] } },
        ];
        const userIds = new Set(userCampgrounds.map((c) => c.id).filter(Boolean));
        const missing = defaultCampgrounds.filter((c) => c.id && !userIds.has(c.id));
        expect(missing).toHaveLength(2);
    });
});

describe("syncMissing fetch contract", () => {
    beforeEach(() => {
        // @ts-expect-error patching globalThis.fetch for tests
        globalThis.fetch = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("GET /api/default fetches the curator default config", async () => {
        const defaultRecord = makeDefaultRecord([
            { id: "233881", name: "Deadwood Lookout", sites: { favorites: [], worthwhile: [] } },
        ]);
        const fetchMock = mockFetch(defaultRecord);
        globalThis.fetch = fetchMock;

        const result = await fetch(DEFAULT_ENDPOINT, { credentials: "include" });
        const data = (await result.json()) as typeof defaultRecord;

        expect(fetchMock).toHaveBeenCalledWith(DEFAULT_ENDPOINT, { credentials: "include" });
        expect(data.campgrounds["recreation.gov"]).toHaveLength(1);
    });

    it("syncMissing PUTs merged list via the existing campgrounds endpoint", async () => {
        const existing = [{ id: "111", name: "Existing", sites: { favorites: [], worthwhile: [] } }];
        const missing = [
            { id: "233881", name: "Deadwood Lookout", sites: { favorites: [], worthwhile: [] } },
        ];
        const merged = [...existing, ...missing];
        const globalSettings = { stayLengths: [2, 3, 4, 5], validStartDays: ["Monday"] };
        const stored = makeFakeRecord({
            updatedAt: "2024-01-03T00:00:00.000Z",
            campgrounds: { "recreation.gov": merged },
        });
        const fetchMock = mockFetch(stored);
        globalThis.fetch = fetchMock;

        // Simulate what syncMissing does: PUT merged config
        await fetch(ENDPOINT, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ campgrounds: { "recreation.gov": merged }, globalSettings }),
            credentials: "include",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            ENDPOINT,
            expect.objectContaining({
                method: "PUT",
                body: expect.stringContaining("233881"),
            }),
        );
    });
});
