"use client";

import { DatePickerStrip } from "@/components/dashboard/date-picker-strip/date-picker-strip";
import { LoadingGhostRow } from "@/components/field-notes/loading";
import { GroupHeader } from "./group-header";
import { WatchlistTable } from "./watchlist-table";
import type { DateRange } from "react-day-picker";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

export type GroupBy = "region" | "status" | "all";

interface WatchlistSectionProps {
    campgroundsByAreas: ProcessedCampground[];
    openCounts: Map<string, number>;
    isLoading: boolean;
    groupBy: GroupBy;
    onGroupBy: (v: GroupBy) => void;
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    readOnly?: boolean;
    showControls?: boolean;
    onRatingChange?: (campgroundId: string, siteName: string, rating: "favorite" | "worthwhile" | "unrated") => void;
    onEditSettings?: (campgroundId: string) => void;
    PAD: number;
}

export function WatchlistSection({
    campgroundsByAreas,
    openCounts,
    isLoading,
    groupBy,
    onGroupBy,
    dateRange,
    calRange,
    datePickerOpen,
    setDatePickerOpen,
    handleCalSelect,
    favorites,
    onToggleFavorite,
    settings,
    globalSettings,
    isMobile,
    readOnly,
    showControls = true,
    onRatingChange,
    onEditSettings,
    PAD,
}: WatchlistSectionProps) {
    const watchlistGroups = (() => {
        const rows = campgroundsByAreas;
        if (groupBy === "all") {
            return [{ label: "All Campgrounds", rows }];
        }
        if (groupBy === "status") {
            const hasOpenings = rows.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) > 0);
            const quiet = rows.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) === 0);
            const groups = [];
            if (hasOpenings.length > 0) groups.push({ label: "Has openings", rows: hasOpenings });
            if (quiet.length > 0) groups.push({ label: "Quiet", rows: quiet });
            return groups;
        }
        // By region: group by area
        const areaMap = new Map<string, ProcessedCampground[]>();
        for (const c of rows) {
            const key = c.area ?? "Other";
            const arr = areaMap.get(key) ?? [];
            arr.push(c);
            areaMap.set(key, arr);
        }
        return Array.from(areaMap.entries()).map(([label, rows]) => ({ label, rows }));
    })();

    return (
        <section className="relative border-t-[1.5px] border-cw-ink" style={{ padding: `24px ${PAD}px 60px` }}>
            <div className="pt-7 mb-[18px]">
                <div className="font-mono-field text-[11px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[10px] uppercase">
                    {readOnly
                        ? `The list · ${campgroundsByAreas.length} campground${campgroundsByAreas.length !== 1 ? "s" : ""}`
                        : `§ II — THE WATCHLIST · ${campgroundsByAreas.length} CAMPGROUND${campgroundsByAreas.length !== 1 ? "S" : ""}`
                    }
                </div>
                <h2 className="m-0 tracking-[-0.005em]">
                    {readOnly ? (
                        <>
                            <span className="font-poster font-black leading-none uppercase inline" style={{ fontSize: isMobile ? 24 : 32 }}>ALL</span>
                            <span className="font-italic-serif font-medium italic leading-none text-cw-forest tracking-[-0.01em]" style={{ fontSize: isMobile ? 24 : 32, marginLeft: 10 }}>
                                the picks.
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="font-poster font-black leading-none uppercase inline" style={{ fontSize: isMobile ? 24 : 32 }}>EVERY PLACE</span>
                            <span className="font-italic-serif font-medium italic leading-none text-cw-forest tracking-[-0.01em]" style={{ fontSize: isMobile ? 24 : 32, marginLeft: 10 }}>
                                you&apos;re watching.
                            </span>
                        </>
                    )}
                </h2>
            </div>

            {showControls && (
                <DatePickerStrip
                    dateRange={dateRange}
                    calRange={calRange}
                    datePickerOpen={datePickerOpen}
                    setDatePickerOpen={setDatePickerOpen}
                    handleCalSelect={handleCalSelect}
                    isMobile={isMobile}
                    groupBy={groupBy}
                    onGroupBy={onGroupBy}
                />
            )}

            {isLoading && campgroundsByAreas.length === 0 ? (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <LoadingGhostRow key={i} height={56} />
                    ))}
                </div>
            ) : (
                <div className="grid gap-7">
                    {watchlistGroups.map((group, gi) => {
                        const openInGroup = group.rows.reduce((sum, c) => sum + (openCounts.get(c.id ?? c.name) ?? 0), 0);
                        return (
                            <div key={group.label}>
                                {groupBy !== "all" && (
                                    <GroupHeader index={gi} label={group.label} count={group.rows.length} openInGroup={openInGroup} />
                                )}
                                <WatchlistTable
                                    rows={group.rows}
                                    showHeader={gi === 0}
                                    favorites={favorites}
                                    onToggleFavorite={onToggleFavorite}
                                    openCounts={openCounts}
                                    windowStart={dateRange.start}
                                    windowEnd={dateRange.end}
                                    settings={settings}
                                    globalSettings={globalSettings}
                                    isMobile={isMobile}
                                    readOnly={readOnly}
                                    onRatingChange={onRatingChange}
                                    onEditSettings={onEditSettings}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
