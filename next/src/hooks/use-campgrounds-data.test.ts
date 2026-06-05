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
});
