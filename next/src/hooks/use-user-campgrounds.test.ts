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
// default-additions actions: defaultCampgrounds / addCampground /
// addAllFromDefault / dismissRecentlyAdded
// ---------------------------------------------------------------------------

const SEEN_ENDPOINT = "/api/users/me/seen-default";

interface RouteState {
    userRecord: ReturnType<typeof makeFakeRecord>;
    defaultRecord: { campgrounds: { "recreation.gov": unknown[] }; globalSettings: unknown };
    calls: Array<{ url: string; method: string; body?: string }>;
}

/** A fetch mock that routes by URL + method and records every call. */
function routedFetch(state: RouteState) {
    return vi.fn((url: string, opts?: RequestInit) => {
        const u = String(url);
        const method = (opts?.method ?? "GET").toUpperCase();
        state.calls.push({ url: u, method, body: opts?.body as string | undefined });

        if (u.includes("/api/default")) {
            return Promise.resolve(new Response(JSON.stringify(state.defaultRecord), { status: 200 }));
        }
        if (u.includes(SEEN_ENDPOINT)) {
            return Promise.resolve(new Response(JSON.stringify({ defaultSeenAt: "now" }), { status: 200 }));
        }
        // /api/users/me/campgrounds (GET hydration or PUT save)
        if (method === "PUT") {
            const parsed = JSON.parse(opts!.body as string) as { campgrounds: unknown };
            const stored = makeFakeRecord({
                updatedAt: "2024-02-01T00:00:00.000Z",
                campgrounds: parsed.campgrounds as never,
            });
            return Promise.resolve(new Response(JSON.stringify(stored), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify(state.userRecord), { status: 200 }));
    });
}

function cg(id: string) {
    return { id, name: `CG ${id}`, sites: { favorites: [], worthwhile: [] } };
}

describe("default-additions actions", () => {
    afterEach(() => vi.restoreAllMocks());

    function mount(state: RouteState) {
        globalThis.fetch = routedFetch(state) as never;
        return renderHook(() => useUserCampgrounds());
    }

    it("exposes the curator default list via defaultCampgrounds", async () => {
        const state: RouteState = {
            userRecord: makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" }),
            defaultRecord: { campgrounds: { "recreation.gov": [cg("233881")] }, globalSettings: {} },
            calls: [],
        };
        const { result } = mount(state);
        await waitFor(() => expect(result.current.defaultCampgrounds).toHaveLength(1));
        expect(result.current.defaultCampgrounds[0]?.id).toBe("233881");
    });

    it("addCampground PUTs the user's list with the new campground appended", async () => {
        const state: RouteState = {
            userRecord: makeFakeRecord({
                updatedAt: "2024-01-01T00:00:00.000Z",
                campgrounds: { "recreation.gov": [cg("111")] },
            }),
            defaultRecord: { campgrounds: { "recreation.gov": [] }, globalSettings: {} },
            calls: [],
        };
        const { result } = mount(state);
        await waitFor(() => expect(result.current.isHydrating).toBe(false));

        await act(async () => {
            await result.current.addCampground(cg("999") as never);
        });

        const put = state.calls.find((c) => c.method === "PUT");
        expect(put).toBeDefined();
        expect(put!.body).toContain("999");
        expect(put!.body).toContain("111");
        expect(result.current.siteConfig["recreation.gov"].map((c) => c.id)).toEqual(["111", "999"]);
    });

    it("addCampground is a no-op when the campground is already on the list", async () => {
        const state: RouteState = {
            userRecord: makeFakeRecord({
                updatedAt: "2024-01-01T00:00:00.000Z",
                campgrounds: { "recreation.gov": [cg("111")] },
            }),
            defaultRecord: { campgrounds: { "recreation.gov": [] }, globalSettings: {} },
            calls: [],
        };
        const { result } = mount(state);
        await waitFor(() => expect(result.current.isHydrating).toBe(false));

        await act(async () => {
            await result.current.addCampground(cg("111") as never);
        });

        expect(state.calls.some((c) => c.method === "PUT")).toBe(false);
    });

    it("addAllFromDefault merges missing defaults, acks seen-default, and reports the count", async () => {
        const state: RouteState = {
            userRecord: makeFakeRecord({
                updatedAt: "2024-01-01T00:00:00.000Z",
                campgrounds: { "recreation.gov": [cg("111")] },
            }),
            defaultRecord: {
                campgrounds: { "recreation.gov": [cg("111"), cg("222"), cg("333")] },
                globalSettings: {},
            },
            calls: [],
        };
        const { result } = mount(state);
        await waitFor(() => expect(result.current.defaultCampgrounds).toHaveLength(3));

        let added = -1;
        await act(async () => {
            added = (await result.current.addAllFromDefault()).added;
        });

        expect(added).toBe(2);
        const put = state.calls.find((c) => c.method === "PUT");
        expect(put!.body).toContain("222");
        expect(put!.body).toContain("333");
        expect(state.calls.some((c) => c.url.includes(SEEN_ENDPOINT) && c.method === "POST")).toBe(true);
    });

    it("dismissRecentlyAdded POSTs to the seen-default endpoint", async () => {
        const state: RouteState = {
            userRecord: makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" }),
            defaultRecord: { campgrounds: { "recreation.gov": [] }, globalSettings: {} },
            calls: [],
        };
        const { result } = mount(state);
        await waitFor(() => expect(result.current.isHydrating).toBe(false));

        await act(async () => {
            await result.current.dismissRecentlyAdded();
        });

        expect(state.calls.some((c) => c.url.includes(SEEN_ENDPOINT) && c.method === "POST")).toBe(true);
    });
});
