"use client";

import { useEffect, useMemo, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { useCampgroundSites } from "@/hooks/use-campground-sites";
import {
    type Horizon,
    TIER_MARK,
    buildDisplaySites,
    buildHorizon,
    campgroundRuns,
    dateAt,
    dayIndexOf,
    reservationUrl,
    siteFeature,
    siteOpenRuns,
} from "@/lib/timeline";
import type { BlackoutRange, ProcessedCampground } from "@/types/campground";
import { useSiteSettings } from "@/context/site-settings";
import { TimelineAxis } from "./timeline-axis";
import { TimelineTrack } from "./timeline-track";
import { SiteWindowsList } from "./site-windows";
import { CampgroundMapModal } from "@/components/dashboard/map-modal/campground-map-modal";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const PAD = 10;

interface MobileTimelineProps {
    rows: ProcessedCampground[];
    dateRange: { start: Date; end: Date };
    onEditSettings?: (campgroundId: string) => void;
}

function dayStatusSets(h: Horizon, cg: ProcessedCampground) {
    const runs = campgroundRuns(h, cg);
    const openDays = new Set<number>();
    const limitedDays = new Set<number>();
    runs.open.forEach(([s, e]) => {
        for (let i = s; i <= e; i++) openDays.add(i);
    });
    runs.limited.forEach(([s, e]) => {
        for (let i = s; i <= e; i++) limitedDays.add(i);
    });
    return { runs, openDays, limitedDays };
}

function horizonMonths(h: Horizon): Array<{ year: number; month: number }> {
    const start = dateAt(h, 0);
    const end = dateAt(h, h.totalDays - 1);
    const out: Array<{ year: number; month: number }> = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
        out.push({ year: cur.getFullYear(), month: cur.getMonth() });
        cur.setMonth(cur.getMonth() + 1);
    }
    return out;
}

export function MobileTimeline({ rows, dateRange, onEditSettings }: MobileTimelineProps) {
    const horizon = useMemo(
        () => buildHorizon(dateRange.start, dateRange.end),
        [dateRange.start, dateRange.end],
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mapOpen, setMapOpen] = useState(false);
    const { sitesById, ensureLoaded } = useCampgroundSites();
    const blackoutDates = useSiteSettings()?.dates.blackoutDates;

    const selected = selectedId ? rows.find((r) => (r.id ?? r.name) === selectedId) : undefined;

    // Lazily fetch the full roster for the open detail so every site shows.
    useEffect(() => {
        if (selected?.id) ensureLoaded(selected.id);
    }, [selected?.id, ensureLoaded]);

    // The detail screen and the map modal each push a history entry, so the
    // phone's back-swipe (and back button) unwinds one layer at a time:
    // map → detail → watchlist, instead of jumping straight out of the app.
    const openDetail = (id: string) => {
        setSelectedId(id);
        if (typeof window !== "undefined") window.history.pushState({ cwCampgroundDetail: true }, "");
    };
    const openMap = () => {
        setMapOpen(true);
        if (typeof window !== "undefined")
            window.history.pushState({ cwCampgroundDetail: true, cwMapModal: true }, "");
    };
    // When we own the top history entry, unwind it via back() so the stack stays
    // consistent; popstate then syncs open/closed state. Otherwise close directly.
    const goBackOr = (flag: "cwCampgroundDetail" | "cwMapModal", fallback: () => void) => {
        const state = typeof window !== "undefined" ? window.history.state : null;
        if ((state as Record<string, boolean> | null)?.[flag]) window.history.back();
        else fallback();
    };
    const closeDetail = () => goBackOr("cwCampgroundDetail", () => setSelectedId(null));
    const closeMap = () => goBackOr("cwMapModal", () => setMapOpen(false));

    useEffect(() => {
        const onPop = () => {
            const state = typeof window !== "undefined" ? window.history.state : null;
            const s = state as { cwCampgroundDetail?: boolean; cwMapModal?: boolean } | null;
            setMapOpen(Boolean(s?.cwMapModal));
            setSelectedId((prev) => (s?.cwCampgroundDetail ? prev : null));
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    if (selected) {
        return (
            <>
                <DetailScreen
                    campground={selected}
                    horizon={horizon}
                    onBack={closeDetail}
                    onOpenMap={openMap}
                    onEditSettings={onEditSettings}
                    roster={selected.id ? sitesById[selected.id] : undefined}
                    blackoutDates={blackoutDates}
                />
                <CampgroundMapModal campground={selected} open={mapOpen} onClose={closeMap} />
            </>
        );
    }

    return (
        <div
            className="overflow-hidden bg-cw-cream"
            style={{ border: `1.5px solid ${CW.ink}`, boxShadow: `6px 6px 0 ${CW.forest}` }}
        >
            <div
                className="sticky top-0 z-10"
                style={{
                    background: CW.cream,
                    borderBottom: `2px solid ${CW.ink}`,
                    padding: `10px ${PAD}px 0`,
                }}
            >
                <TimelineAxis horizon={horizon} compact />
            </div>
            {rows.map((cg) => {
                const { runs } = dayStatusSets(horizon, cg);
                const isOpen = runs.openNights > 0;
                const favOpenCount = (cg.sites?.favorites ?? []).filter((name) => {
                    const s = Object.values(cg.siteAvailability ?? {}).find((x) => x.siteName === name);
                    return s ? siteOpenRuns(horizon, s).length > 0 : false;
                }).length;
                return (
                    <button
                        key={cg.id ?? cg.name}
                        type="button"
                        onClick={() => openDetail(cg.id ?? cg.name)}
                        className="block w-full border-b border-dotted text-left last:border-b-0"
                        style={{ borderColor: CW.rule, padding: `12px ${PAD}px 14px` }}
                    >
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span
                                className="font-italic-serif italic"
                                style={{ fontSize: 19, color: CW.ink }}
                            >
                                {(cg.sites?.favorites?.length ?? 0) > 0 && (
                                    <span style={{ color: CW.clay, marginRight: 6 }}>★</span>
                                )}
                                {cg.name}
                            </span>
                            <span className="inline-flex shrink-0 items-center gap-[6px]">
                                <span
                                    className="rounded-full"
                                    style={{
                                        width: 7,
                                        height: 7,
                                        background: isOpen ? CW.forest : "transparent",
                                        border: isOpen ? undefined : `1.5px solid ${CW.clay}`,
                                    }}
                                />
                                <span
                                    className="font-mono-field font-bold uppercase leading-none"
                                    style={{
                                        fontSize: 11,
                                        letterSpacing: "0.12em",
                                        color: isOpen ? CW.forest : CW.clay,
                                    }}
                                >
                                    {favOpenCount > 0 ? `★ ${favOpenCount} open` : isOpen ? "Open" : "Quiet"}
                                </span>
                            </span>
                        </div>
                        {cg.area && (
                            <div
                                className="mb-2 overflow-hidden font-body-serif text-ellipsis whitespace-nowrap"
                                style={{ fontSize: 12, color: CW.inkSoft }}
                            >
                                {cg.area}
                            </div>
                        )}
                        <TimelineTrack
                            horizon={horizon}
                            open={runs.open}
                            limited={runs.limited}
                            pad={0}
                            height={40}
                            blackoutDates={blackoutDates}
                        />
                    </button>
                );
            })}
        </div>
    );
}

function DetailScreen({
    campground,
    horizon,
    onBack,
    onOpenMap,
    onEditSettings,
    roster,
    blackoutDates,
}: {
    campground: ProcessedCampground;
    horizon: Horizon;
    onBack: () => void;
    onOpenMap?: () => void;
    onEditSettings?: (campgroundId: string) => void;
    roster?: string[];
    blackoutDates?: BlackoutRange[];
}) {
    const { runs, openDays, limitedDays } = dayStatusSets(horizon, campground);
    const [openSites, setOpenSites] = useState<Set<string>>(new Set());
    const toggleSite = (id: string) =>
        setOpenSites((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // Mini-calendars: only months with any availability.
    const months = horizonMonths(horizon);
    const monthsWithData = months.filter(({ year, month }) => {
        const days = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= days; d++) {
            const idx = dayIndexOf(
                horizon,
                `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
            );
            if (openDays.has(idx) || limitedDays.has(idx)) return true;
        }
        return false;
    });
    const quietHidden = months.length - monthsWithData.length;

    const firstOpenSite = Object.values(campground.siteAvailability ?? {}).find(
        (s) => siteOpenRuns(horizon, s).length > 0,
    );
    const cta = firstOpenSite
        ? reservationUrl(firstOpenSite)
        : `https://www.recreation.gov/camping/campgrounds/${campground.id}`;

    return (
        <div
            className="overflow-hidden bg-cw-cream"
            style={{ border: `1.5px solid ${CW.ink}`, boxShadow: `6px 6px 0 ${CW.forest}` }}
        >
            <div style={{ padding: `12px ${PAD}px`, borderBottom: `2px solid ${CW.ink}` }}>
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="font-mono-field uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.clay }}
                    >
                        ← Watchlist
                    </button>
                    <div className="flex items-center gap-4">
                        {onOpenMap && campground.id && (
                            <button
                                type="button"
                                onClick={onOpenMap}
                                className="font-mono-field font-semibold uppercase"
                                style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.forest }}
                            >
                                Map &amp; sites
                            </button>
                        )}
                        {onEditSettings && campground.id && (
                            <button
                                type="button"
                                onClick={() => onEditSettings(campground.id)}
                                className="font-mono-field uppercase"
                                style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.inkSoft }}
                            >
                                Configure
                            </button>
                        )}
                    </div>
                </div>
                <h3
                    className="mt-2 mb-1 font-poster font-black uppercase leading-none"
                    style={{ fontSize: 26, color: CW.ink }}
                >
                    {campground.name}
                </h3>
                <div className="font-italic-serif italic" style={{ fontSize: 15, color: CW.inkSoft }}>
                    {runs.openNights > 0 ? `${runs.openNights} nights open` : "no openings yet"}
                    {campground.area ? ` · ${campground.area}` : ""}
                </div>
            </div>

            <div style={{ padding: `8px ${PAD}px` }}>
                <TimelineTrack
                    horizon={horizon}
                    open={runs.open}
                    limited={runs.limited}
                    pad={0}
                    blackoutDates={blackoutDates}
                />
            </div>

            {/* Mini calendars */}
            {monthsWithData.length > 0 && (
                <div style={{ padding: `4px ${PAD}px 14px` }}>
                    <div className="grid grid-cols-2 gap-3">
                        {monthsWithData.map(({ year, month }) => (
                            <MiniCalendar
                                key={`${year}-${month}`}
                                horizon={horizon}
                                year={year}
                                month={month}
                                openDays={openDays}
                                limitedDays={limitedDays}
                            />
                        ))}
                    </div>
                    {quietHidden > 0 && (
                        <div
                            className="mt-2 font-italic-serif italic"
                            style={{ fontSize: 13, color: CW.inkFaint }}
                        >
                            +{quietHidden} quiet month{quietHidden > 1 ? "s" : ""} hidden
                        </div>
                    )}
                </div>
            )}

            {/* Per-site rows — tap a site with openings to see its dates */}
            <div style={{ borderTop: `1px solid ${CW.rule}` }}>
                {buildDisplaySites(campground, roster).map(({ site, tier }) => {
                    const hasOpen = siteOpenRuns(horizon, site).length > 0;
                    const showWindows = openSites.has(site.siteId);
                    return (
                        <div
                            key={site.siteId}
                            role={hasOpen ? "button" : undefined}
                            tabIndex={hasOpen ? 0 : undefined}
                            onClick={hasOpen ? () => toggleSite(site.siteId) : undefined}
                            className="border-b border-dotted last:border-b-0"
                            style={{
                                borderColor: CW.ruleSoft,
                                cursor: hasOpen ? "pointer" : "default",
                                background:
                                    tier === "fav"
                                        ? "color-mix(in srgb, var(--cw-clay) 5.5%, transparent)"
                                        : tier === "worth"
                                          ? "color-mix(in srgb, var(--cw-forest) 3.5%, transparent)"
                                          : undefined,
                            }}
                        >
                            <div className="flex items-baseline gap-2" style={{ padding: `8px ${PAD}px 0` }}>
                                <span
                                    className="font-mono-field font-bold"
                                    style={{
                                        fontSize: 13,
                                        color:
                                            tier === "fav"
                                                ? CW.clay
                                                : tier === "worth"
                                                  ? CW.forest
                                                  : CW.inkFaint,
                                    }}
                                >
                                    {TIER_MARK[tier]}
                                </span>
                                <span
                                    className="font-mono-field font-semibold"
                                    style={{ fontSize: 12, color: CW.ink }}
                                >
                                    Site {site.siteName}
                                </span>
                                <span
                                    className="overflow-hidden font-italic-serif italic text-ellipsis whitespace-nowrap"
                                    style={{ fontSize: 14, color: CW.inkSoft }}
                                >
                                    {siteFeature(site)}
                                </span>
                                {hasOpen && (
                                    <span
                                        className="ml-auto inline-block transition-transform"
                                        style={{
                                            fontSize: 9,
                                            color: CW.inkFaint,
                                            transform: showWindows ? "rotate(180deg)" : undefined,
                                        }}
                                    >
                                        ▾
                                    </span>
                                )}
                            </div>
                            <TimelineTrack
                                horizon={horizon}
                                open={siteOpenRuns(horizon, site)}
                                limited={[]}
                                site
                                ring={tier === "fav"}
                                pad={PAD}
                                blackoutDates={blackoutDates}
                            />
                            {hasOpen && showWindows && (
                                <SiteWindowsList horizon={horizon} site={site} indent={PAD} />
                            )}
                        </div>
                    );
                })}
            </div>

            <a
                href={cta}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center font-poster font-extrabold uppercase"
                style={{
                    background: CW.forest,
                    color: CW.cream,
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    padding: "16px",
                }}
            >
                Book on recreation.gov →
            </a>
        </div>
    );
}

function MiniCalendar({
    horizon,
    year,
    month,
    openDays,
    limitedDays,
}: {
    horizon: Horizon;
    year: number;
    month: number;
    openDays: Set<number>;
    limitedDays: Set<number>;
}) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();
    const cells: React.ReactNode[] = [];
    for (let b = 0; b < firstDow; b++) cells.push(<div key={`b${b}`} />);
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const idx = dayIndexOf(horizon, iso);
        const dow = new Date(year, month, d).getDay();
        const weekend = dow === 5 || dow === 6;
        const open = openDays.has(idx);
        const limited = limitedDays.has(idx);
        cells.push(
            <div
                key={d}
                className="flex items-center justify-center font-mono-field"
                style={{
                    fontSize: 9,
                    aspectRatio: "1",
                    borderRadius: 3,
                    background: open
                        ? CW.forest
                        : limited
                          ? CW.mustard
                          : weekend
                            ? "color-mix(in srgb, var(--cw-clay) 8%, transparent)"
                            : "transparent",
                    color: open ? CW.cream : limited ? "#3a2f06" : CW.inkFaint,
                }}
            >
                {d}
            </div>,
        );
    }
    return (
        <div>
            <div
                className="mb-1 font-poster font-black uppercase"
                style={{ fontSize: 11, letterSpacing: "0.06em", color: CW.ink }}
            >
                {MON[month]} <span style={{ color: CW.inkFaint }}>{year}</span>
            </div>
            <div className="grid grid-cols-7 gap-[2px]">
                {DOW.map((d, i) => (
                    <div
                        key={i}
                        className="text-center font-mono-field"
                        style={{ fontSize: 8, color: i === 5 || i === 6 ? CW.clay : CW.inkFaint }}
                    >
                        {d}
                    </div>
                ))}
                {cells}
            </div>
        </div>
    );
}
