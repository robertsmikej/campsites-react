"use client";

import { useCallback, useEffect, useState } from "react";
import { formatGroupsByFavorites } from "@/lib/campground-utils";
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

                // Reshape snapshot.campgrounds[] back into the system-keyed map the dashboard expects.
                const bySystem: CampgroundsBySystem = { "recreation.gov": [] };
                for (const cg of snapshot.campgrounds) {
                    bySystem["recreation.gov"]?.push({
                        campgroundId: cg.campgroundId,
                        campgroundName: cg.campgroundName,
                        campgroundArea: cg.campgroundArea,
                        campgroundDescription: cg.campgroundDescription,
                        siteAvailability: cg.sites,
                        totalSitesCount: cg.totalSitesCount,
                    } as unknown as ProcessedCampground);
                }
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
