"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";
import { DatePickerStrip } from "@/components/dashboard/date-picker-strip/date-picker-strip";
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
    snoozedCgs: Set<string>;
    onSnoozeCg: (id: string) => void;
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
    snoozedCgs,
    onSnoozeCg,
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
        <section style={{ padding: `24px ${PAD}px 60px`, position: "relative", borderTop: `1.5px solid ${CW.ink}` }}>
            <div style={{ paddingTop: 28, marginBottom: 18 }}>
                <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                    § II — THE WATCHLIST · {campgroundsByAreas.length} CAMPGROUND{campgroundsByAreas.length !== 1 ? "S" : ""}
                </div>
                <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                    <span style={{ font: `900 ${isMobile ? 24 : 32}px/1 ${FH}`, textTransform: "uppercase", display: "inline" }}>EVERY PLACE</span>
                    <span style={{ font: `500 italic ${isMobile ? 24 : 32}px/1 ${FI}`, color: CW.forest, marginLeft: 10, letterSpacing: "-0.01em" }}>
                        you&apos;re watching.
                    </span>
                </h2>
            </div>

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

            {isLoading && campgroundsByAreas.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse" style={{ height: 56, background: CW.cream, border: `1px solid ${CW.rule}`, borderRadius: 2 }} />
                    ))}
                </div>
            ) : (
                <div style={{ display: "grid", gap: 28 }}>
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
                                    snoozedCgs={snoozedCgs}
                                    onSnoozeCg={onSnoozeCg}
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
