"use client";

import { useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { toLocalIso } from "@/components/dashboard/helpers";
import type { ProcessedCampground, SiteAvailability, GlobalSettings } from "@/types/campground";

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
                className="font-mono-field text-[13px] font-bold leading-none tracking-[0.12em] uppercase"
                style={{ color: isOpen ? CW.forest : CW.clay }}
            >
                {isOpen ? "Open" : "Quiet"}
            </span>
        </span>
    );
}

// ─── Day buckets for a single site ───────────────────────────────────────────
function siteDayPattern(site: SiteAvailability, windowStart: Date, windowEnd: Date): string[] {
    const days: string[] = [];
    const cursor = new Date(windowStart);
    cursor.setHours(0, 0, 0, 0);
    const winEndIso = toLocalIso(windowEnd);
    while (toLocalIso(cursor) <= winEndIso) {
        const iso = toLocalIso(cursor);
        let hit = false;
        for (const m of site.matches ?? []) {
            if (m.from <= iso && m.to > iso) {
                hit = true;
                break;
            }
        }
        days.push(hit ? "g" : ".");
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function countOpenInWindow(site: SiteAvailability, windowStart: Date, windowEnd: Date): number {
    const startIso = toLocalIso(windowStart);
    const endIso = toLocalIso(windowEnd);
    let n = 0;
    for (const m of site.matches ?? []) {
        if (m.from >= startIso && m.from <= endIso) n++;
    }
    return n;
}

// ─── Availability bars (campground-level or per-site) ────────────────────────
function Bars({ pattern, height = 22, bar = 5 }: { pattern: string[]; height?: number; bar?: number }) {
    const sample =
        pattern.length > 42
            ? pattern.filter((_, i) => i % Math.ceil(pattern.length / 42) === 0).slice(0, 42)
            : pattern;
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

function campgroundDayPattern(
    campground: ProcessedCampground,
    windowStart: Date,
    windowEnd: Date,
): string[] {
    const days: string[] = [];
    const cursor = new Date(windowStart);
    cursor.setHours(0, 0, 0, 0);
    const winEndIso = toLocalIso(windowEnd);
    while (toLocalIso(cursor) <= winEndIso) {
        const iso = toLocalIso(cursor);
        let hit = false;
        for (const site of Object.values(campground.siteAvailability ?? {})) {
            for (const m of site.matches ?? []) {
                if (m.from <= iso && m.to > iso) {
                    hit = true;
                    break;
                }
            }
            if (hit) break;
        }
        days.push(hit ? "g" : ".");
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

// ─── Humanize the rec.gov campsite_type string ───────────────────────────────
function humanKind(site: SiteAvailability, isFavorite: boolean): string {
    const raw = site.campsite_type?.toLowerCase().replace(/_/g, " ").trim() ?? "";
    const cleaned = raw
        .replace(/standard nonelectric/, "standard")
        .replace(/group standard area/, "group")
        .replace(/tent only nonelectric/, "tent only");
    return isFavorite ? `${cleaned || "site"} · favorite` : cleaned || "site";
}

function reservationUrl(site: SiteAvailability): string {
    const m = site.matches?.[0];
    if (!m) return `https://www.recreation.gov/camping/campsites/${site.siteId}`;
    return `https://www.recreation.gov/camping/campsites/${site.siteId}?arrivalDate=${m.from}&departureDate=${m.to}`;
}

// ─── Expanded site list (shared desktop + mobile, layout varies) ─────────────
interface ExpandedSitesProps {
    campground: ProcessedCampground;
    windowStart: Date;
    windowEnd: Date;
    isMobile: boolean;
    onToggleSiteFavorite?: (siteName: string, isFavorite: boolean) => void;
}

function ExpandedSites({
    campground,
    windowStart,
    windowEnd,
    isMobile,
    onToggleSiteFavorite,
}: ExpandedSitesProps) {
    const sites = Object.values(campground.siteAvailability ?? {});
    const favorites = new Set(campground.sites?.favorites ?? []);

    // Sort: favorites first, then by open count desc, then by site name.
    const ranked = [...sites].sort((a, b) => {
        const af = favorites.has(a.siteName) ? 1 : 0;
        const bf = favorites.has(b.siteName) ? 1 : 0;
        if (af !== bf) return bf - af;
        const ao = countOpenInWindow(a, windowStart, windowEnd);
        const bo = countOpenInWindow(b, windowStart, windowEnd);
        if (ao !== bo) return bo - ao;
        return a.siteName.localeCompare(b.siteName);
    });

    const totalSites = sites.length;
    const openSites = sites.filter((s) => countOpenInWindow(s, windowStart, windowEnd) > 0).length;

    if (totalSites === 0) {
        return (
            <div
                className="bg-[rgba(26,22,20,0.025)] border-b border-cw-rule-soft"
                style={{ padding: isMobile ? "12px 22px 14px 22px" : "14px 22px 18px 56px" }}
            >
                <div className="font-italic-serif text-[14px] italic text-cw-ink-soft">
                    Site-level data not loaded yet. The notifier will populate it on the next poll.
                </div>
            </div>
        );
    }

    return (
        <div
            className="bg-[rgba(26,22,20,0.025)] border-b border-cw-rule-soft"
            style={{ padding: isMobile ? "12px 22px 14px 22px" : "14px 22px 18px 56px" }}
        >
            <div className="font-mono-field text-[12px] font-medium leading-none tracking-[0.16em] uppercase text-cw-ink-subtle mb-3 flex justify-between gap-3 flex-wrap">
                <span>
                    {totalSites} {totalSites === 1 ? "site" : "sites"} · {openSites} open across these dates
                </span>
                <span className="hidden sm:inline">Click a site to book on recreation.gov</span>
            </div>

            <div
                className={isMobile ? "flex flex-col gap-3" : "grid gap-x-[18px] gap-y-2 items-center"}
                style={
                    isMobile
                        ? undefined
                        : { gridTemplateColumns: "minmax(180px, 1fr) minmax(0, 2fr) 60px" }
                }
            >
                {ranked.map((s) => {
                    const isFav = favorites.has(s.siteName);
                    const open = countOpenInWindow(s, windowStart, windowEnd);
                    const pattern = siteDayPattern(s, windowStart, windowEnd);
                    const url = reservationUrl(s);

                    if (isMobile) {
                        return (
                            <div
                                key={s.siteId}
                                className="flex items-center justify-between gap-3 py-1 border-b border-cw-rule-soft last:border-0"
                            >
                                <div className="flex items-center gap-[6px] min-w-0 flex-1">
                                    {onToggleSiteFavorite && campground.id ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleSiteFavorite(s.siteName, !isFav);
                                            }}
                                            className="bg-transparent border-none cursor-pointer p-0 shrink-0"
                                            aria-label={isFav ? "Remove site favorite" : "Mark site favorite"}
                                            style={{ color: isFav ? CW.mustard : CW.inkFaint }}
                                        >
                                            <FavStar filled={isFav} />
                                        </button>
                                    ) : isFav ? (
                                        <span style={{ color: CW.mustard }}>
                                            <FavStar filled />
                                        </span>
                                    ) : null}
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-body-serif text-[13px] font-semibold text-cw-ink hover:underline"
                                    >
                                        Site {s.siteName}
                                    </a>
                                    <span className="font-italic-serif text-[12px] italic text-cw-ink-soft truncate">
                                        {humanKind(s, isFav)}
                                    </span>
                                </div>
                                <span
                                    className="font-mono-field text-[12px] font-medium leading-none shrink-0"
                                    style={{
                                        color: open === 0 ? CW.inkFaint : CW.forest,
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    {open || "—"}
                                </span>
                            </div>
                        );
                    }

                    return (
                        <SiteRow
                            key={s.siteId}
                            site={s}
                            url={url}
                            isFavorite={isFav}
                            open={open}
                            pattern={pattern}
                            campgroundId={campground.id}
                            onToggleSiteFavorite={onToggleSiteFavorite}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function SiteRow({
    site,
    url,
    isFavorite,
    open,
    pattern,
    campgroundId,
    onToggleSiteFavorite,
}: {
    site: SiteAvailability;
    url: string;
    isFavorite: boolean;
    open: number;
    pattern: string[];
    campgroundId?: string;
    onToggleSiteFavorite?: (siteName: string, isFavorite: boolean) => void;
}) {
    return (
        <>
            <div className="flex items-center gap-[8px] min-w-0">
                {onToggleSiteFavorite && campgroundId ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleSiteFavorite(site.siteName, !isFavorite);
                        }}
                        className="bg-transparent border-none cursor-pointer p-0 shrink-0"
                        aria-label={isFavorite ? "Remove site favorite" : "Mark site favorite"}
                        style={{ color: isFavorite ? CW.mustard : CW.inkFaint }}
                    >
                        <FavStar filled={isFavorite} small />
                    </button>
                ) : isFavorite ? (
                    <span style={{ color: CW.mustard }}>
                        <FavStar filled small />
                    </span>
                ) : (
                    <span style={{ width: 11, height: 11 }} />
                )}
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-body-serif text-[13px] font-semibold text-cw-ink hover:underline"
                >
                    Site {site.siteName}
                </a>
                <span className="font-italic-serif text-[13px] italic text-cw-ink-soft truncate">
                    {humanKind(site, isFavorite)}
                </span>
            </div>
            <Bars pattern={pattern} height={16} bar={4} />
            <span
                className="text-right font-mono-field text-[13px] font-medium leading-none"
                style={{
                    color: open === 0 ? CW.inkFaint : CW.forest,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {open || "—"}
            </span>
        </>
    );
}

function FavStar({ filled, small = false }: { filled: boolean; small?: boolean }) {
    const size = small ? 11 : 18;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 20 20"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
        </svg>
    );
}

function ChevronCaret({ open }: { open: boolean }) {
    return (
        <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            style={{
                transform: open ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 150ms ease",
            }}
        >
            <path d="M2 4 L5 7 L8 4" />
        </svg>
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

export function WatchlistRow(props: WatchlistRowProps) {
    return props.isMobile ? <MobileRow {...props} /> : <DesktopRow {...props} />;
}

function DesktopRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    readOnly,
    onRatingChange,
    onEditSettings,
}: WatchlistRowProps) {
    const [expanded, setExpanded] = useState(false);

    const onToggleSiteFavorite =
        onRatingChange && campground.id
            ? (siteName: string, makeFav: boolean) => {
                  onRatingChange(campground.id!, siteName, makeFav ? "favorite" : "unrated");
              }
            : undefined;

    return (
        <div>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded((v) => !v);
                    }
                }}
                aria-expanded={expanded}
                className="grid gap-6 px-[22px] py-4 items-center border-b border-cw-rule-soft cursor-pointer hover:bg-cw-cream/40 transition-colors"
                style={{
                    gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 130px",
                    background: openCount > 0 ? `rgba(31,61,42,0.04)` : "transparent",
                }}
            >
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
                            <FavStar filled={isFavorite} />
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

                <StatusPill openCount={openCount} />

                <Bars
                    pattern={campgroundDayPattern(campground, windowStart, windowEnd)}
                    height={22}
                    bar={5}
                />

                <div
                    className="text-right font-poster text-[22px] font-black leading-none"
                    style={{
                        color: openCount === 0 ? CW.inkFaint : CW.forest,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {openCount}
                </div>

                <div className="flex justify-end items-center gap-[6px]">
                    {onEditSettings && campground.id && !readOnly && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditSettings(campground.id!);
                            }}
                            className="font-mono-field text-[12px] font-bold leading-none tracking-[0.14em] uppercase px-[9px] py-[7px] border border-cw-rule rounded-[2px] cursor-pointer bg-transparent text-cw-ink hover:bg-cw-cream"
                        >
                            Settings
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((v) => !v);
                        }}
                        aria-label={expanded ? "Hide sites" : "Show sites"}
                        className="font-mono-field text-[12px] font-bold leading-none tracking-[0.14em] uppercase px-[9px] py-[7px] border border-cw-rule rounded-[2px] cursor-pointer bg-transparent text-cw-ink hover:bg-cw-cream inline-flex items-center gap-[6px]"
                    >
                        {expanded ? "Hide" : "Sites"}
                        <ChevronCaret open={expanded} />
                    </button>
                </div>
            </div>

            {expanded && (
                <ExpandedSites
                    campground={campground}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    isMobile={false}
                    onToggleSiteFavorite={readOnly ? undefined : onToggleSiteFavorite}
                />
            )}
        </div>
    );
}

function MobileRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    readOnly,
    onRatingChange,
    onEditSettings,
}: WatchlistRowProps) {
    const [expanded, setExpanded] = useState(false);

    const onToggleSiteFavorite =
        onRatingChange && campground.id
            ? (siteName: string, makeFav: boolean) => {
                  onRatingChange(campground.id!, siteName, makeFav ? "favorite" : "unrated");
              }
            : undefined;

    return (
        <div className="border-b border-cw-rule-soft">
            <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded((v) => !v);
                    }
                }}
                aria-expanded={expanded}
                className="px-[22px] py-3 cursor-pointer active:bg-cw-cream/40 transition-colors"
                style={{ background: openCount > 0 ? "rgba(31,61,42,0.04)" : "transparent" }}
            >
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
                            <FavStar filled={isFavorite} />
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="font-poster text-[15px] font-black leading-[1.1] uppercase tracking-[0.005em] overflow-hidden text-ellipsis whitespace-nowrap">
                            {campground.name}
                        </div>
                        <div className="font-italic-serif text-[13px] font-medium italic leading-[1.3] text-cw-ink-soft mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">
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

                <div className="flex items-center justify-between gap-3 mt-[10px]">
                    <StatusPill openCount={openCount} />
                    <Bars
                        pattern={campgroundDayPattern(campground, windowStart, windowEnd)}
                        height={18}
                        bar={4}
                    />
                </div>

                <div className="flex justify-end items-center gap-[6px] mt-[10px]">
                    {onEditSettings && campground.id && !readOnly && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditSettings(campground.id!);
                            }}
                            className="font-mono-field text-[12px] font-bold leading-none tracking-[0.14em] uppercase px-[9px] py-[7px] border border-cw-rule rounded-[2px] cursor-pointer bg-transparent text-cw-ink"
                        >
                            Settings
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((v) => !v);
                        }}
                        aria-label={expanded ? "Hide sites" : "Show sites"}
                        className="font-mono-field text-[12px] font-bold leading-none tracking-[0.14em] uppercase px-[9px] py-[7px] border border-cw-rule rounded-[2px] cursor-pointer bg-transparent text-cw-ink inline-flex items-center gap-[6px]"
                    >
                        {expanded ? "Hide" : "Sites"}
                        <ChevronCaret open={expanded} />
                    </button>
                </div>
            </div>

            {expanded && (
                <ExpandedSites
                    campground={campground}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    isMobile={true}
                    onToggleSiteFavorite={readOnly ? undefined : onToggleSiteFavorite}
                />
            )}
        </div>
    );
}
