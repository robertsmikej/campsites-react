"use client";

import { WatchlistRow } from "./watchlist-row";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

interface WatchlistTableProps {
    rows: ProcessedCampground[];
    showHeader: boolean;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    openCounts: Map<string, number>;
    windowStart: Date;
    windowEnd: Date;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    readOnly?: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
    onEditSettings?: (campgroundId: string) => void;
}

export function WatchlistTable({
    rows,
    showHeader,
    favorites,
    onToggleFavorite,
    openCounts,
    windowStart,
    windowEnd,
    settings,
    globalSettings,
    isMobile,
    readOnly,
    onRatingChange,
    onEditSettings,
}: WatchlistTableProps) {
    return (
        <div className="bg-cw-cream border border-cw-ink">
            {showHeader && !isMobile && (
                <div
                    className="grid gap-6 px-[22px] py-[11px] border-b border-cw-rule font-mono-field text-[12px] font-medium leading-none tracking-[0.16em] text-cw-ink-subtle uppercase items-center"
                    style={{ gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px" }}
                >
                    <span>Campground</span>
                    <span>Status</span>
                    <span>Dates</span>
                    <span className="text-right">Open</span>
                </div>
            )}
            {rows.map((c) => (
                <WatchlistRow
                    key={c.id ?? c.name}
                    campground={c}
                    isFavorite={!!c.id && favorites.has(c.id)}
                    onToggleFavorite={() => c.id && onToggleFavorite(c.id)}
                    openCount={openCounts.get(c.id ?? c.name) ?? 0}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    settings={settings}
                    globalSettings={globalSettings}
                    isMobile={isMobile}
                    readOnly={readOnly}
                    onRatingChange={readOnly ? undefined : onRatingChange}
                    onEditSettings={readOnly ? undefined : onEditSettings}
                />
            ))}
        </div>
    );
}
