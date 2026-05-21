"use client";

import { CampgroundRow } from "@/components/campground-row";
import { CW } from "@/components/field-notes/cw-tokens";
import { readStorage, snoozeUntilDate, formatSnoozeLabel } from "@/components/dashboard/helpers";
import { toLocalIso } from "@/components/dashboard/helpers";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ openCount }: { openCount: number }) {
    const isOpen = openCount > 0;
    return (
        <span className="inline-flex items-center gap-[6px]">
            {isOpen
                ? <span className="w-[7px] h-[7px] rounded-full bg-cw-forest" />
                : <span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-cw-clay" />}
            <span className="font-mono-field text-[11px] font-bold leading-none tracking-[0.12em] uppercase" style={{ color: isOpen ? CW.forest : CW.clay }}>
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
        <div className="flex gap-[2px] items-end shrink-0" style={{ height: height + 2 }}>
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
        <div
            className="grid gap-6 px-[22px] py-4 items-center border-b border-cw-rule-soft"
            style={{
                gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 140px",
                background: openCount > 0 ? `rgba(31,61,42,0.04)` : "transparent",
            }}
        >
            {/* Name + area */}
            <div className="flex items-center gap-[10px] min-w-0">
                <button
                    className="bg-transparent border-none cursor-pointer p-0 shrink-0"
                    style={{ color: isFavorite ? CW.mustard : CW.inkFaint }}
                    onClick={onToggleFavorite}
                    aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
                    </svg>
                </button>
                <div className="min-w-0">
                    <div className="font-poster text-[16px] font-black leading-[1.1] uppercase tracking-[0.005em] overflow-hidden text-ellipsis whitespace-nowrap">
                        {campground.name}
                    </div>
                    <div className="font-italic-serif text-[13px] font-medium italic leading-[1.3] text-cw-ink-soft mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {campground.area ?? ""}
                    </div>
                </div>
            </div>

            {/* Status */}
            <StatusPill openCount={openCount} />

            {/* Availability bars */}
            <AvailBars campground={campground} windowStart={windowStart} windowEnd={windowEnd} height={22} bar={5} />

            {/* Open count */}
            <div className="text-right font-poster text-[22px] font-black leading-none" style={{ color: openCount === 0 ? CW.inkFaint : CW.forest, fontVariantNumeric: "tabular-nums" }}>
                {openCount}
            </div>

            {/* Snooze */}
            <div className="flex justify-end">
                {isSnoozed ? (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        className="font-mono-field text-[10px] font-bold leading-none tracking-[0.12em] uppercase bg-cw-mustard text-cw-ink border-none px-[9px] py-[7px] cursor-pointer rounded-[2px] inline-flex items-center gap-[5px]"
                    >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" /></svg>
                        Until {formatSnoozeLabel(readStorage<Record<string, string>>("campwatch:snoozed-cgs", {})[campground.id ?? ""] ?? snoozeUntilDate())}
                    </button>
                ) : (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        className="font-mono-field text-[10px] font-bold leading-none tracking-[0.12em] uppercase bg-transparent text-cw-ink-subtle border border-cw-rule px-[9px] py-[7px] cursor-pointer rounded-[2px] inline-flex items-center gap-[5px]"
                    >
                        Snooze
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4 L5 7 L8 4" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}
