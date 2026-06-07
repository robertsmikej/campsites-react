"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGroupsByFavorites, overlayConfigRatings, type ConfigOverlay } from "@/lib/campground-utils";
import { WATCHLIST_CHANGED_EVENT } from "@/lib/events";
import type { AvailabilitySnapshot } from "@/lib/recgov";
import type { CampgroundsBySystem, ProcessedCampground, SiteConfig } from "@/types/campground";

interface UseCampgroundsDataArgs {
    enabled: boolean;
    /** Live watchlist config; favorite/worthwhile labels are overlaid from here
     * so dashboard edits show instantly instead of waiting for a snapshot rebuild. */
    siteConfig?: SiteConfig;
}

interface ProgressBarData {
    totalCalls: number;
    currentCall: number;
    progress: number;
}

export function useCampgroundsData({ enabled, siteConfig }: UseCampgroundsDataArgs) {
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

    // Map of campground id -> live favorites/worthwhile from the watchlist config.
    // Recomputed only when the config changes.
    const ratingsById = useMemo(() => {
        const map = new Map<string, ConfigOverlay>();
        for (const cg of siteConfig?.["recreation.gov"] ?? []) {
            if (cg.id) {
                map.set(cg.id, {
                    favorites: cg.sites?.favorites ?? [],
                    worthwhile: cg.sites?.worthwhile ?? [],
                });
            }
        }
        return map;
    }, [siteConfig]);

    useEffect(() => {
        if (Object.keys(campgroundsData).length === 0) {
            setCampgroundsByAreas([]);
            return;
        }
        const overlaid = overlayConfigRatings(
            campgroundsData as Record<string, ProcessedCampground[]>,
            ratingsById,
        );
        setCampgroundsByAreas(formatGroupsByFavorites(overlaid) ?? []);
    }, [campgroundsData, ratingsById]);

    return { campgroundsData, campgroundsByAreas, isFetching, progressBarData, refresh };
}
