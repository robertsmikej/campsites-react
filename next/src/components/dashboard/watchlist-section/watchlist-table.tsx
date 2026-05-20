"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";
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
    snoozedCgs: Set<string>;
    onSnoozeCg: (id: string) => void;
    onRatingChange?: (campgroundId: string, siteName: string, rating: "favorite" | "worthwhile" | "unrated") => void;
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
    snoozedCgs,
    onSnoozeCg,
    onRatingChange,
    onEditSettings,
}: WatchlistTableProps) {
    return (
        <div style={{ background: CW.cream, border: `1px solid ${CW.ink}` }}>
            {showHeader && !isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 140px", gap: 24, padding: "11px 22px", borderBottom: `1px solid ${CW.rule}`, font: `500 10px/1 ${FM}`, letterSpacing: "0.16em", color: CW.inkSubtle, textTransform: "uppercase", alignItems: "center" }}>
                    <span>Campground</span><span>Status</span><span>Dates</span><span style={{ textAlign: "right" }}>Open</span><span />
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
                    snoozedCgs={snoozedCgs}
                    onSnoozeCg={onSnoozeCg}
                    onRatingChange={onRatingChange}
                    onEditSettings={onEditSettings}
                />
            ))}
        </div>
    );
}
