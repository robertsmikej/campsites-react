import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCampgroundSites } from "./use-campground-sites";

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ sites: ["001", "002"] }), { status: 200 }),
    );
});
afterEach(() => vi.restoreAllMocks());

it("loads a campground's roster once and exposes it by id", async () => {
    const { result } = renderHook(() => useCampgroundSites());
    act(() => result.current.ensureLoaded("234007"));
    await waitFor(() => expect(result.current.sitesById["234007"]).toEqual(["001", "002"]));

    act(() => result.current.ensureLoaded("234007")); // dedup
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/campgrounds/234007/sites", expect.any(Object));
});

it("ignores non-numeric ids", async () => {
    const { result } = renderHook(() => useCampgroundSites());
    act(() => result.current.ensureLoaded("abc"));
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
});
