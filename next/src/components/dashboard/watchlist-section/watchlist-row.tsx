"use client";

import { CampgroundRow } from "@/components/campground-row";
import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";
import { readStorage, snoozeUntilDate, formatSnoozeLabel } from "@/components/dashboard/helpers";
import { toLocalIso } from "@/components/dashboard/helpers";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ openCount }: { openCount: number }) {
    const isOpen = openCount > 0;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isOpen
                ? <span style={{ width: 7, height: 7, borderRadius: 4, background: CW.forest }} />
                : <span style={{ width: 7, height: 7, borderRadius: 4, border: `1.5px solid ${CW.clay}` }} />}
            <span style={{ font: `700 11px/1 ${FM}`, letterSpacing: "0.12em", color: isOpen ? CW.forest : CW.clay, textTransform: "uppercase" }}>
                {isOpen ? "Open" : "Quiet"}
            </span>
        </span>
    );
}

// ─── Availability bars ────────────────────────────────────────────────────────
function AvailBars({ campground, windowStart, windowEnd, height = 22, bar = 5 }: {
    campground: ProcessedCampground;
    windowStart: Date;
    windowEnd: Date;
    height?: number;
    bar?: number;
}) {
    const days: string[] = [];
    const cursor = new Date(windowStart);
    cursor.setHours(0, 0, 0, 0);
    const winEndIso = toLocalIso(windowEnd);

    while (toLocalIso(cursor) <= winEndIso) {
        const iso = toLocalIso(cursor);
        let hasMatch = false;
        for (const site of Object.values(campground.siteAvailability ?? {})) {
            for (const m of site.matches ?? []) {
                if (m.from <= iso && m.to > iso) { hasMatch = true; break; }
            }
            if (hasMatch) break;
        }
        days.push(hasMatch ? "g" : ".");
        cursor.setDate(cursor.getDate() + 1);
    }

    const sample = days.length > 42 ? days.filter((_, i) => i % Math.ceil(days.length / 42) === 0).slice(0, 42) : days;

    return (
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: height + 2, flexShrink: 0 }}>
            {sample.map((c, i) => {
                const h = c === "." ? Math.round(height * 0.22) : height;
                const bg = c === "." ? CW.inkFaint : CW.forest;
                return <div key={i} style={{ width: bar, height: h, background: bg, borderRadius: 1 }} />;
            })}
        </div>
    );
}

// ─── Watchlist row ────────────────────────────────────────────────────────────
interface WatchlistRowProps {
    campground: ProcessedCampground;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    openCount: number;
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

export function WatchlistRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    settings,
    globalSettings,
    isMobile,
    snoozedCgs,
    onSnoozeCg,
    onRatingChange,
    onEditSettings,
}: WatchlistRowProps) {
    const isSnoozed = !!campground.id && snoozedCgs.has(campground.id);

    if (isMobile) {
        return (
            <CampgroundRow
                campground={campground}
                showExcluded={false}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
                settings={settings}
                globalSettings={globalSettings}
                imageUrl="/images/sites/bg_default.jpg"
                onRatingChange={onRatingChange && campground.id
                    ? (siteName, newRating) => onRatingChange(campground.id!, siteName, newRating)
                    : undefined}
                onEditSettings={onEditSettings && campground.id
                    ? () => onEditSettings(campground.id!)
                    : undefined}
                windowStart={windowStart}
                windowEnd={windowEnd}
            />
        );
    }

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 140px",
            gap: 24, padding: "16px 22px", alignItems: "center",
            background: openCount > 0 ? `rgba(31,61,42,0.04)` : "transparent",
            borderBottom: `1px solid ${CW.ruleSoft}`,
        }}>
            {/* Name + area */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <button
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: isFavorite ? CW.mustard : CW.inkFaint, flexShrink: 0 }}
                    onClick={onToggleFavorite}
                    aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
                    </svg>
                </button>
                <div style={{ minWidth: 0 }}>
                    <div style={{ font: `900 16px/1.1 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {campground.name}
                    </div>
                    <div style={{ font: `500 italic 13px/1.3 ${FI}`, color: CW.inkSoft, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {campground.area ?? ""}
                    </div>
                </div>
            </div>

            {/* Status */}
            <StatusPill openCount={openCount} />

            {/* Availability bars */}
            <AvailBars campground={campground} windowStart={windowStart} windowEnd={windowEnd} height={22} bar={5} />

            {/* Open count */}
            <div style={{ textAlign: "right", font: `900 22px/1 ${FH}`, color: openCount === 0 ? CW.inkFaint : CW.forest, fontVariantNumeric: "tabular-nums" }}>
                {openCount}
            </div>

            {/* Snooze */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {isSnoozed ? (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase", background: CW.mustard, color: CW.ink, border: "none", padding: "7px 9px", cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" /></svg>
                        Until {formatSnoozeLabel(readStorage<Record<string, string>>("campwatch:snoozed-cgs", {})[campground.id ?? ""] ?? snoozeUntilDate())}
                    </button>
                ) : (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase", background: "transparent", color: CW.inkSubtle, border: `1px solid ${CW.rule}`, padding: "7px 9px", cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                        Snooze
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4 L5 7 L8 4" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}
