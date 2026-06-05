import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCampgroundsData } from "./use-campgrounds-data";
import { WATCHLIST_CHANGED_EVENT } from "@/lib/events";

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
