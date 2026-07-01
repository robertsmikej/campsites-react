"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatGroupsByFavorites, overlayConfigRatings, type ConfigOverlay } from "@/lib/campground-utils";
import {
    WATCHLIST_CHANGED_EVENT,
    AVAILABILITY_UPDATED_MESSAGE,
    AVAILABILITY_POLL_INTERVAL_MS,
} from "@/lib/events";
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
    const [loadError, setLoadError] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
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
                    // Keep the last-good data rather than clearing it — a transient
                    // failure shouldn't empty the watchlist (that's indistinguishable
                    // from "no openings"). Flag the error so the UI can surface it.
                    if (!cancelled) setLoadError(true);
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
                setUpdatedAt(snapshot.updatedAt ?? null);
                setLoadError(false);
            } catch (e) {
                console.error("[availability] fetch error:", e);
                if (!cancelled) setLoadError(true);
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [enabled, reloadKey]);

    // Keep availability fresh without a manual page reload. The snapshot is
    // cache-backed (3-min TTL over a notifier-warmed raw cache), so repeat
    // fetches are cheap. We refetch on every signal that means "the data on
    // screen might be stale":
    //   - watchlist changed (campground added/edited)
    //   - tab became visible / window refocused / network came back
    //   - the push service worker signaled a watched site opened
    //   - a visible-only interval, so a left-open dashboard stays current
    useEffect(() => {
        if (!enabled) return;
        const bump = () => setReloadKey((k) => k + 1);
        const bumpIfVisible = () => {
            if (document.visibilityState === "visible") bump();
        };
        const onSwMessage = (event: MessageEvent) => {
            if (event.data?.type === AVAILABILITY_UPDATED_MESSAGE) bump();
        };

        window.addEventListener(WATCHLIST_CHANGED_EVENT, bump);
        window.addEventListener("focus", bump);
        window.addEventListener("online", bump);
        document.addEventListener("visibilitychange", bumpIfVisible);

        const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
        sw?.addEventListener("message", onSwMessage);

        // Hidden tabs skip the bump (and browsers throttle background timers), so
        // this never fetches behind the user's back.
        const pollId = setInterval(bumpIfVisible, AVAILABILITY_POLL_INTERVAL_MS);

        return () => {
            window.removeEventListener(WATCHLIST_CHANGED_EVENT, bump);
            window.removeEventListener("focus", bump);
            window.removeEventListener("online", bump);
            document.removeEventListener("visibilitychange", bumpIfVisible);
            sw?.removeEventListener("message", onSwMessage);
            clearInterval(pollId);
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

    return {
        campgroundsData,
        campgroundsByAreas,
        isFetching,
        loadError,
        updatedAt,
        progressBarData,
        refresh,
    };
}
