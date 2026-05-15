"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCampgrounds } from "@/lib/recreation-gov";
import { formatGroupsByFavorites } from "@/lib/campground-utils";
import type {
    CampgroundsBySystem,
    ProcessedCampground,
    SiteConfig,
} from "@/types/campground";

interface ProgressBarData {
    totalCalls: number;
    currentCall: number;
    progress: number;
}

interface UseCampgroundsDataArgs {
    siteConfig: SiteConfig;
    settings: unknown;
    useMockData: boolean;
    enabled: boolean;
}

export function useCampgroundsData({
    siteConfig,
    settings,
    useMockData,
    enabled,
}: UseCampgroundsDataArgs) {
    const [campgroundsData, setCampgroundsData] = useState<CampgroundsBySystem>({});
    const [campgroundsByAreas, setCampgroundsByAreas] = useState<ProcessedCampground[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [progressBarData, setProgressBarData] = useState<ProgressBarData>({
        totalCalls: 0,
        currentCall: 0,
        progress: 0,
    });
    const [reloadKey, setReloadKey] = useState(0);

    const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        async function run() {
            setIsFetching(true);
            setProgressBarData({ totalCalls: 0, currentCall: 0, progress: 0 });
            const data = await fetchCampgrounds(
                siteConfig,
                settings as never,
                (current: number, total: number) => {
                    if (cancelled) return;
                    setProgressBarData({
                        currentCall: current,
                        totalCalls: total,
                        progress: total > 0 ? current / total : 0,
                    });
                },
                false,
                { useMockData },
            );
            if (cancelled) return;
            setCampgroundsData((data as CampgroundsBySystem) ?? {});
            setIsFetching(false);
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [siteConfig, settings, useMockData, enabled, reloadKey]);

    useEffect(() => {
        if (Object.keys(campgroundsData).length === 0) {
            setCampgroundsByAreas([]);
            return;
        }
        setCampgroundsByAreas(formatGroupsByFavorites(campgroundsData) ?? []);
    }, [campgroundsData]);

    return { campgroundsData, campgroundsByAreas, isFetching, progressBarData, refresh };
}
