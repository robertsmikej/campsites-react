"use client";

import { useMemo } from "react";
import { groupCampgrounds } from "@/lib/campground-groups";
import type { CampgroundGroup } from "@/lib/campground-groups";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";
import { GroupWatchlistSection } from "./group-watchlist-section";
import { WatchlistSection } from "@/components/dashboard/watchlist-section";
import { useDashboardPrefs } from "@/hooks/use-dashboard-prefs";

interface GroupedWatchlistProps {
    campgroundsByAreas: ProcessedCampground[];
    /** The full siteConfig campgrounds (unprocessed) for computing maxEnd. */
    rawCampgrounds: { dates?: { startDate?: string; endDate?: string } }[];
    openCounts: Map<string, number>;
    isLoading: boolean;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
    onEditSettings?: (campgroundId: string) => void;
    onEditAll?: () => void;
    PAD: number;
}

export function GroupedWatchlist({
    campgroundsByAreas,
    rawCampgrounds,
    openCounts,
    isLoading,
    favorites,
    onToggleFavorite,
    settings,
    globalSettings,
    isMobile,
    onRatingChange,
    onEditSettings,
    onEditAll,
    PAD,
}: GroupedWatchlistProps) {
    const groups: CampgroundGroup<ProcessedCampground>[] = useMemo(
        () => groupCampgrounds(campgroundsByAreas),
        [campgroundsByAreas],
    );

    // When there's only one group and it's the default (ungrouped) bucket,
    // render the classic single-section watchlist with no visual change.
    const isUngrouped = groups.length <= 1 && (groups.length === 0 || groups[0]!.name === "");

    // For the ungrouped fallback, use the existing dashboard prefs hook (unchanged
    // behavior: single date range for the whole watchlist).
    const maxWatchlistEnd = useMemo(() => {
        let latest: Date | null = null;
        for (const cg of rawCampgrounds) {
            const iso = cg.dates?.endDate;
            if (!iso) continue;
            const d = new Date(iso + "T00:00:00");
            if (!latest || d > latest) latest = d;
        }
        return latest ?? undefined;
    }, [rawCampgrounds]);

    const {
        dateRange,
        calRange,
        hasCustomRange,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        clearDateRange,
    } = useDashboardPrefs({ maxEnd: maxWatchlistEnd });

    if (isUngrouped) {
        return (
            <WatchlistSection
                campgroundsByAreas={campgroundsByAreas}
                openCounts={openCounts}
                isLoading={isLoading}
                dateRange={dateRange}
                calRange={calRange}
                hasCustomRange={hasCustomRange}
                datePickerOpen={datePickerOpen}
                setDatePickerOpen={setDatePickerOpen}
                handleCalSelect={handleCalSelect}
                onClearDates={clearDateRange}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                settings={settings}
                globalSettings={globalSettings}
                isMobile={isMobile}
                onRatingChange={onRatingChange}
                onEditSettings={onEditSettings}
                onEditAll={onEditAll}
                PAD={PAD}
            />
        );
    }

    // Multi-group: render per-group timeline sections.
    return (
        <>
            {groups.map((group, index) => (
                <GroupWatchlistSection
                    key={group.name || "__default__"}
                    group={group}
                    isFirst={index === 0}
                    totalCampgroundCount={campgroundsByAreas.length}
                    isLoading={isLoading}
                    favorites={favorites}
                    onToggleFavorite={onToggleFavorite}
                    settings={settings}
                    globalSettings={globalSettings}
                    isMobile={isMobile}
                    onRatingChange={onRatingChange}
                    onEditSettings={onEditSettings}
                    onEditAll={index === 0 ? onEditAll : undefined}
                    PAD={PAD}
                />
            ))}
        </>
    );
}
