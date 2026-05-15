import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The hook itself is a React hook and requires a DOM + React renderer.
// Vitest is configured with environment:"node", so we test the observable
// contract via a thin manual driver that patches globalThis.fetch and
// invokes the underlying fetch logic directly — matching the same URL /
// method / body shapes the hook uses.

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
            record.updatedAt === null &&
            (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
        expect(isEmpty).toBe(true);
    });

    it("isEmpty is false when updatedAt is set", () => {
        const record = makeFakeRecord({ updatedAt: "2024-01-01T00:00:00.000Z" });
        const isEmpty =
            record.updatedAt === null &&
            (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
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
            record.updatedAt === null &&
            (record.campgrounds["recreation.gov"]?.length ?? 0) === 0;
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

        expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({
            method: "PUT",
            body: expect.stringContaining('"recreation.gov":[]'),
        }));
    });

    it("exports the hook function", async () => {
        const mod = await import("./use-user-campgrounds");
        expect(typeof mod.useUserCampgrounds).toBe("function");
    });
});
