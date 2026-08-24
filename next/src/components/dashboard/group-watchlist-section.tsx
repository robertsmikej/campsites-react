"use client";

import { useMemo } from "react";
import { useGroupDateRange } from "@/hooks/use-group-date-range";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import { WatchlistSection } from "@/components/dashboard/watchlist-section";
import { CW } from "@/components/field-notes/cw-tokens";
import type { CampgroundGroup } from "@/lib/campground-groups";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

interface GroupWatchlistSectionProps {
    group: CampgroundGroup<ProcessedCampground>;
    isFirst: boolean;
    totalCampgroundCount: number;
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
    onEditAll?: (() => void) | undefined;
    PAD: number;
}

export function GroupWatchlistSection({
    group,
    isFirst,
    totalCampgroundCount,
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
}: GroupWatchlistSectionProps) {
    const {
        dateRange,
        calRange,
        hasCustomRange,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        clearDateRange,
    } = useGroupDateRange(group.name, group.dateRange);

    // Compute open counts scoped to this group's date range.
    const groupOpenCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of group.campgrounds) {
            m.set(c.id ?? c.name, getCampgroundOpenCount(c, dateRange.start, dateRange.end));
        }
        return m;
    }, [group.campgrounds, dateRange]);

    const groupLabel = group.name || "Watchlist";

    return (
        <section
            className="relative border-t-[1.5px] border-cw-ink"
            style={{ padding: `24px ${Math.max(10, PAD - 12)}px 12px` }}
        >
            {/* Group header */}
            <div className={`${isFirst ? "pt-7" : "pt-3"} mb-[18px] flex items-start justify-between gap-4`}>
                <div>
                    {isFirst && (
                        <div className="font-mono-field text-[13px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[10px] uppercase">
                            § II — THE WATCHLIST · {totalCampgroundCount} CAMPGROUND
                            {totalCampgroundCount !== 1 ? "S" : ""}
                        </div>
                    )}
                    <h2 className="m-0 tracking-[-0.005em]">
                        <span
                            className="font-poster font-black leading-none uppercase inline"
                            style={{ fontSize: isMobile ? 20 : 26 }}
                        >
                            {groupLabel}
                        </span>
                        <span
                            className="font-italic-serif font-medium italic leading-none text-cw-ink-soft tracking-[-0.01em] ml-2"
                            style={{ fontSize: isMobile ? 16 : 18 }}
                        >
                            {group.campgrounds.length} campground{group.campgrounds.length !== 1 ? "s" : ""}
                        </span>
                    </h2>
                </div>
                {isFirst && onEditAll && (
                    <button
                        type="button"
                        onClick={onEditAll}
                        className="shrink-0 cursor-pointer whitespace-nowrap rounded-full font-mono-field font-semibold uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--cw-forest)_8%,transparent)]"
                        style={{
                            fontSize: 11,
                            letterSpacing: "0.08em",
                            padding: "8px 14px",
                            color: CW.forest,
                            border: `1px solid ${CW.rule}`,
                        }}
                    >
                        Edit Campgrounds
                    </button>
                )}
            </div>

            {/* Reuse WatchlistSection for the date picker + timeline, skipping its header */}
            <WatchlistSection
                campgroundsByAreas={group.campgrounds}
                openCounts={groupOpenCounts}
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
                showSectionHeader={false}
                skipSeasonClamp
                onRatingChange={onRatingChange}
                onEditSettings={onEditSettings}
                PAD={PAD}
            />
        </section>
    );
}
