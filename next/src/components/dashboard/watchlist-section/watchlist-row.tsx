"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampgroundDetail } from "@/components/campground-detail";
import { CW } from "@/components/field-notes/cw-tokens";
import { toLocalIso } from "@/components/dashboard/helpers";
import { getCampgroundImageUrl } from "@/components/campground/get-image-url";
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ openCount }: { openCount: number }) {
    const isOpen = openCount > 0;
    return (
        <span className="inline-flex items-center gap-[6px]">
            {isOpen ? (
                <span className="w-[7px] h-[7px] rounded-full bg-cw-forest" />
            ) : (
                <span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-cw-clay" />
            )}
            <span
                className="font-mono-field text-[11px] font-bold leading-none tracking-[0.12em] uppercase"
                style={{ color: isOpen ? CW.forest : CW.clay }}
            >
                {isOpen ? "Open" : "Quiet"}
            </span>
        </span>
    );
}

// ─── Availability bars ────────────────────────────────────────────────────────
function AvailBars({
    campground,
    windowStart,
    windowEnd,
    height = 22,
    bar = 5,
}: {
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
                if (m.from <= iso && m.to > iso) {
                    hasMatch = true;
                    break;
                }
            }
            if (hasMatch) break;
        }
        days.push(hasMatch ? "g" : ".");
        cursor.setDate(cursor.getDate() + 1);
    }

    const sample =
        days.length > 42 ? days.filter((_, i) => i % Math.ceil(days.length / 42) === 0).slice(0, 42) : days;

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
    readOnly?: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
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
    readOnly,
    onRatingChange,
    onEditSettings,
}: WatchlistRowProps) {
    if (isMobile) {
        return (
            <MobileRow
                campground={campground}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
                openCount={openCount}
                windowStart={windowStart}
                windowEnd={windowEnd}
                settings={settings}
                globalSettings={globalSettings}
                readOnly={readOnly}
                onRatingChange={onRatingChange}
                onEditSettings={onEditSettings}
            />
        );
    }

    return (
        <DesktopRow
            campground={campground}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            openCount={openCount}
            windowStart={windowStart}
            windowEnd={windowEnd}
            settings={settings}
            globalSettings={globalSettings}
            readOnly={readOnly}
            onRatingChange={onRatingChange}
            onEditSettings={onEditSettings}
        />
    );
}

interface DesktopRowProps {
    campground: ProcessedCampground;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    openCount: number;
    windowStart: Date;
    windowEnd: Date;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    readOnly?: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
    onEditSettings?: (campgroundId: string) => void;
}

function DesktopRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    settings,
    globalSettings,
    readOnly,
    onRatingChange,
    onEditSettings,
}: DesktopRowProps) {
    const [open, setOpen] = useState(false);

    // Build siteRatings map for the drawer from the campground's stored favorites/worthwhile
    const siteRatings: SiteRatingsMap = {};
    for (const name of campground.sites?.favorites ?? []) siteRatings[name] = "favorite";
    for (const name of campground.sites?.worthwhile ?? []) {
        if (!(name in siteRatings)) siteRatings[name] = "worthwhile";
    }
    const hasSiteRatings = Object.keys(siteRatings).length > 0;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="grid gap-6 px-[22px] py-4 items-center border-b border-cw-rule-soft cursor-pointer hover:bg-cw-cream/40 transition-colors"
                style={{
                    gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px",
                    background: openCount > 0 ? `rgba(31,61,42,0.04)` : "transparent",
                }}
            >
                {/* Name + area */}
                <div className="flex items-center gap-[10px] min-w-0">
                    {!readOnly && (
                        <button
                            className="bg-transparent border-none cursor-pointer p-0 shrink-0"
                            style={{ color: isFavorite ? CW.mustard : CW.inkFaint }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite();
                            }}
                            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 20 20"
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
                            </svg>
                        </button>
                    )}
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
                <AvailBars
                    campground={campground}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    height={22}
                    bar={5}
                />

                {/* Open count */}
                <div
                    className="text-right font-poster text-[22px] font-black leading-none"
                    style={{
                        color: openCount === 0 ? CW.inkFaint : CW.forest,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {openCount}
                </div>
            </div>

            <SheetContent
                side="right"
                className="w-full overflow-y-auto px-6 data-[side=right]:sm:max-w-4xl sm:px-8"
            >
                <SheetHeader className="px-0">
                    <SheetTitle className="font-display text-xl">{campground.name}</SheetTitle>
                </SheetHeader>
                <CampgroundDetail
                    campground={campground}
                    showExcluded={false}
                    settings={settings}
                    globalSettings={globalSettings}
                    imageUrl={getCampgroundImageUrl(campground)}
                    siteRatings={hasSiteRatings ? siteRatings : undefined}
                    onRatingChange={
                        onRatingChange && campground.id
                            ? (siteName, newRating) => onRatingChange(campground.id!, siteName, newRating)
                            : undefined
                    }
                    onEditSettings={
                        onEditSettings && campground.id ? () => onEditSettings(campground.id!) : undefined
                    }
                />
            </SheetContent>
        </Sheet>
    );
}

interface MobileRowProps {
    campground: ProcessedCampground;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    openCount: number;
    windowStart: Date;
    windowEnd: Date;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    readOnly?: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
    onEditSettings?: (campgroundId: string) => void;
}

function MobileRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    settings,
    globalSettings,
    readOnly,
    onRatingChange,
    onEditSettings,
}: MobileRowProps) {
    const [open, setOpen] = useState(false);

    const siteRatings: SiteRatingsMap = {};
    for (const name of campground.sites?.favorites ?? []) siteRatings[name] = "favorite";
    for (const name of campground.sites?.worthwhile ?? []) {
        if (!(name in siteRatings)) siteRatings[name] = "worthwhile";
    }
    const hasSiteRatings = Object.keys(siteRatings).length > 0;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
                className="px-[22px] py-3 border-b border-cw-rule-soft cursor-pointer active:bg-cw-cream/40 transition-colors"
                style={{ background: openCount > 0 ? "rgba(31,61,42,0.04)" : "transparent" }}
            >
                {/* Top row: star + name + count */}
                <div className="flex items-center gap-[10px] min-w-0">
                    {!readOnly && (
                        <button
                            className="bg-transparent border-none cursor-pointer p-0 shrink-0"
                            style={{ color: isFavorite ? CW.mustard : CW.inkFaint }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite();
                            }}
                            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 20 20"
                                fill={isFavorite ? "currentColor" : "none"}
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
                            </svg>
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="font-poster text-[15px] font-black leading-[1.1] uppercase tracking-[0.005em] overflow-hidden text-ellipsis whitespace-nowrap">
                            {campground.name}
                        </div>
                        <div className="font-italic-serif text-[12px] font-medium italic leading-[1.3] text-cw-ink-soft mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {campground.area ?? ""}
                        </div>
                    </div>
                    <div
                        className="font-poster text-[20px] font-black leading-none shrink-0"
                        style={{
                            color: openCount === 0 ? CW.inkFaint : CW.forest,
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {openCount}
                    </div>
                </div>

                {/* Bottom row: status pill + bars */}
                <div className="flex items-center justify-between gap-3 mt-[10px]">
                    <StatusPill openCount={openCount} />
                    <AvailBars
                        campground={campground}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                        height={18}
                        bar={4}
                    />
                </div>
            </div>

            <SheetContent
                side="right"
                className="w-full overflow-y-auto px-6 data-[side=right]:sm:max-w-4xl sm:px-8"
            >
                <SheetHeader className="px-0">
                    <SheetTitle className="font-display text-xl">{campground.name}</SheetTitle>
                </SheetHeader>
                <CampgroundDetail
                    campground={campground}
                    showExcluded={false}
                    settings={settings}
                    globalSettings={globalSettings}
                    imageUrl={getCampgroundImageUrl(campground)}
                    siteRatings={hasSiteRatings ? siteRatings : undefined}
                    onRatingChange={
                        onRatingChange && campground.id
                            ? (siteName, newRating) => onRatingChange(campground.id!, siteName, newRating)
                            : undefined
                    }
                    onEditSettings={
                        onEditSettings && campground.id ? () => onEditSettings(campground.id!) : undefined
                    }
                />
            </SheetContent>
        </Sheet>
    );
}
