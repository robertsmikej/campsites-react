"use client";

import { CampgroundRow } from "@/components/campground-row";
import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";
import { readStorage, snoozeUntilDate, formatSnoozeLabel } from "@/components/dashboard/helpers";
import { DatePickerStrip } from "@/components/dashboard/date-picker-strip";
import type { DateRange } from "react-day-picker";
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
function toLocalIsoInline(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    const winEndIso = toLocalIsoInline(windowEnd);

    while (toLocalIsoInline(cursor) <= winEndIso) {
        const iso = toLocalIsoInline(cursor);
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

function WatchlistRow({
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

// ─── Group header ─────────────────────────────────────────────────────────────
function GroupHeader({ index, label, count, openInGroup }: { index: number; label: string; count: number; openInGroup: number }) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <span style={{ font: `700 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, textTransform: "uppercase" }}>
                {String(index + 1).padStart(2, "0")}
            </span>
            <span style={{ font: `500 italic 22px/1 ${FI}`, color: CW.ink, letterSpacing: "-0.005em" }}>
                {label}
            </span>
            <span style={{ font: `500 11px/1 ${FM}`, color: CW.inkSubtle, letterSpacing: "0.08em" }}>
                · {count} campground{count !== 1 ? "s" : ""}
            </span>
            {openInGroup > 0 && (
                <span style={{ font: `700 11px/1 ${FM}`, color: CW.forest, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    · {openInGroup} open
                </span>
            )}
            <div style={{ flex: 1, height: 1, background: CW.rule }} />
        </div>
    );
}

// ─── Table (grouped) ──────────────────────────────────────────────────────────
function WatchlistTable({ rows, showHeader, favorites, onToggleFavorite, openCounts, windowStart, windowEnd, settings, globalSettings, isMobile, snoozedCgs, onSnoozeCg, onRatingChange, onEditSettings }: {
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
}) {
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

// ─── WatchlistSection ─────────────────────────────────────────────────────────
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
    // Watchlist groups
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

            {/* Toolbar */}
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

            {/* Groups */}
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
