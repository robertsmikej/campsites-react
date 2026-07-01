import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCampgroundsData } from "./use-campgrounds-data";
import {
    WATCHLIST_CHANGED_EVENT,
    AVAILABILITY_UPDATED_MESSAGE,
    AVAILABILITY_POLL_INTERVAL_MS,
} from "@/lib/events";

function okSnapshot() {
    return new Response(JSON.stringify({ updatedAt: "x", campgrounds: [] }), { status: 200 });
}

describe("useCampgroundsData", () => {
    beforeEach(() => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(okSnapshot());
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches /api/availability once on mount when enabled", async () => {
        renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/availability"));
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("does not fetch when disabled", async () => {
        renderHook(() => useCampgroundsData({ enabled: false }));
        await new Promise((r) => setTimeout(r, 0));
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("refetches when the watchlist-changed event fires", async () => {
        renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        act(() => {
            window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT));
        });

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    });

    it("refetches when the tab becomes visible again", async () => {
        renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
        });

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    });

    it("refetches when the window regains focus", async () => {
        renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        act(() => window.dispatchEvent(new Event("focus")));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    });

    it("refetches when the network comes back online", async () => {
        renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

        act(() => window.dispatchEvent(new Event("online")));

        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    });

    it("refetches when the service worker signals an availability update", async () => {
        const swTarget = new EventTarget();
        Object.defineProperty(navigator, "serviceWorker", { value: swTarget, configurable: true });
        try {
            renderHook(() => useCampgroundsData({ enabled: true }));
            await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

            act(() => {
                swTarget.dispatchEvent(
                    new MessageEvent("message", { data: { type: AVAILABILITY_UPDATED_MESSAGE } }),
                );
            });

            await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

            // An unrelated SW message must NOT trigger a refetch.
            act(() => {
                swTarget.dispatchEvent(new MessageEvent("message", { data: { type: "something-else" } }));
            });
            await new Promise((r) => setTimeout(r, 20));
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        } finally {
            Reflect.deleteProperty(navigator, "serviceWorker");
        }
    });

    it("polls availability on an interval while the tab is visible", async () => {
        vi.useFakeTimers();
        try {
            renderHook(() => useCampgroundsData({ enabled: true }));
            // fetch() is invoked synchronously inside the mount effect.
            expect(globalThis.fetch).toHaveBeenCalledTimes(1);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_INTERVAL_MS);
            });
            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("exposes the snapshot updatedAt", async () => {
        const { result } = renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(result.current.updatedAt).toBe("x"));
    });

    it("flags loadError when the availability fetch fails", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
        const { result } = renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(result.current.loadError).toBe(true));
    });

    it("keeps prior data on a transient failure and clears the error on recovery", async () => {
        const snapshot = {
            updatedAt: "x",
            campgrounds: [
                {
                    id: "1",
                    name: "A",
                    area: "",
                    sites: { favorites: [], worthwhile: [] },
                    siteAvailability: {},
                },
            ],
        };
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
        const { result } = renderHook(() => useCampgroundsData({ enabled: true }));
        await waitFor(() => expect(result.current.campgroundsByAreas.length).toBe(1));

        // A later refetch fails — the watchlist must NOT be wiped to empty.
        fetchMock.mockResolvedValueOnce(new Response("err", { status: 500 }));
        act(() => window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT)));
        await waitFor(() => expect(result.current.loadError).toBe(true));
        expect(result.current.campgroundsByAreas.length).toBe(1);

        // A successful retry clears the error flag.
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
        act(() => result.current.refresh());
        await waitFor(() => expect(result.current.loadError).toBe(false));
    });

    it("reflects live siteConfig favorites without a refetch", async () => {
        // The snapshot carries stale favorites; the live siteConfig is authoritative.
        const snapshot = {
            updatedAt: "x",
            campgrounds: [
                {
                    id: "1",
                    name: "A",
                    area: "",
                    sites: { favorites: [], worthwhile: [] },
                    siteAvailability: {},
                },
            ],
        };
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(snapshot), { status: 200 }),
        );

        const cfg = (favorites: string[]) =>
            ({ "recreation.gov": [{ id: "1", name: "A", sites: { favorites, worthwhile: [] } }] }) as never;

        const { result, rerender } = renderHook(
            ({ siteConfig }) => useCampgroundsData({ enabled: true, siteConfig }),
            { initialProps: { siteConfig: cfg([]) } },
        );

        await waitFor(() => expect(result.current.campgroundsByAreas.length).toBe(1));
        expect(result.current.campgroundsByAreas[0]!.sites.favorites).toEqual([]);

        act(() => rerender({ siteConfig: cfg(["011"]) }));

        await waitFor(() => expect(result.current.campgroundsByAreas[0]!.sites.favorites).toEqual(["011"]));
        // No second fetch — favorites are overlaid from config, not the snapshot.
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
});
