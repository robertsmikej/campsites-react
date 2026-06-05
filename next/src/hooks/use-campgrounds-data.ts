"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGroupsByFavorites } from "@/lib/campground-utils";
import { WATCHLIST_CHANGED_EVENT } from "@/lib/events";
import type { AvailabilitySnapshot } from "@/lib/recgov";
import type { CampgroundsBySystem, ProcessedCampground } from "@/types/campground";

interface UseCampgroundsDataArgs {
    enabled: boolean;
}

interface ProgressBarData {
    totalCalls: number;
    currentCall: number;
    progress: number;
}

export function useCampgroundsData({ enabled }: UseCampgroundsDataArgs) {
    const [campgroundsData, setCampgroundsData] = useState<CampgroundsBySystem>({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState<ProcessedCampground[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    // Kept for component-API compatibility; progress is now binary (loading vs done).
    const progressBarData: ProgressBarData = {
        totalCalls: 1,
        currentCall: isFetching ? 0 : 1,
        progress: isFetching ? 0 : 1,
    };

    const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        async function run() {
            setIsFetching(true);
            try {
                const response = await fetch("/api/availability");
                if (!response.ok) {
                    console.error(`[availability] HTTP ${response.status}`);
                    if (!cancelled) setCampgroundsData({});
                    return;
                }
                const snapshot = (await response.json()) as AvailabilitySnapshot;
                if (cancelled) return;

                // Snapshot campgrounds embed the source Campground config, so they
                // already have id/name/sites (ratings)/dates/image/etc. directly.
                const bySystem: CampgroundsBySystem = {
                    "recreation.gov": snapshot.campgrounds as unknown as ProcessedCampground[],
                };
                setCampgroundsData(bySystem);
            } catch (e) {
                console.error("[availability] fetch error:", e);
                if (!cancelled) setCampgroundsData({});
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [enabled, reloadKey]);

    // Keep availability fresh without a manual page reload: refetch after the
    // watchlist changes (campground added/edited) and whenever the tab regains
    // focus. The snapshot is cache-backed, so a repeat fetch is cheap.
    useEffect(() => {
        if (!enabled) return;
        const onChanged = () => setReloadKey((k) => k + 1);
        const onVisible = () => {
            if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
        };
        window.addEventListener(WATCHLIST_CHANGED_EVENT, onChanged);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener(WATCHLIST_CHANGED_EVENT, onChanged);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled]);

    useEffect(() => {
        if (Object.keys(campgroundsData).length === 0) {
            setCampgroundsByAreas([]);
            return;
        }
        setCampgroundsByAreas(
            formatGroupsByFavorites(campgroundsData as Record<string, ProcessedCampground[]>) ?? [],
        );
    }, [campgroundsData]);

    return { campgroundsData, campgroundsByAreas, isFetching, progressBarData, refresh };
}
