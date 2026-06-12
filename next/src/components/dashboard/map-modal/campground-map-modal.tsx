"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { CW } from "@/components/field-notes/cw-tokens";
import { mergeMapSites, type MapSite } from "@/lib/map-sites";
import { SiteList, SitePopover } from "./site-list";
import { MapSummary } from "./map-summary";
import type { SiteDetail } from "@/lib/site-details";
import type { ProcessedCampground } from "@/types/campground";
import type { JSX } from "react";

// Leaflet touches `window` — must never evaluate server-side
const SiteMap = dynamic(() => import("./site-map").then((m) => m.SiteMap), {
    ssr: false,
    loading: () => (
        <div
            aria-label="Loading map"
            style={{
                width: "100%",
                minHeight: 430,
                background: "var(--cw-ink-faint)",
                borderRadius: 3,
            }}
        />
    ),
});

export function CampgroundMapModal({
    campground,
    open,
    onClose,
}: {
    campground: ProcessedCampground | null;
    open: boolean;
    onClose: () => void;
}): JSX.Element | null {
    const [sites, setSites] = useState<MapSite[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
    const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !campground?.id) {
            setSites([]);
            return;
        }

        let cancelled = false;
        setLoading(true);

        fetch(`/api/campgrounds/${campground.id}/site-details`, { credentials: "include" })
            .then((r) =>
                r.ok ? (r.json() as Promise<{ sites: SiteDetail[] }>) : Promise.resolve({ sites: [] }),
            )
            .then(({ sites: details }) => {
                if (cancelled) return;
                const merged = mergeMapSites(details, campground.siteAvailability ?? {}, {
                    favorites: campground.sites?.favorites ?? [],
                    worthwhile: campground.sites?.worthwhile ?? [],
                });
                setSites(merged);
            })
            .catch(() => {
                if (!cancelled) setSites([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, campground?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open && !campground) return null;

    const totalSites = campground?.totalSitesCount ?? Object.keys(campground?.siteAvailability ?? {}).length;
    const bookableCount = sites.filter((s) => s.open).length;
    const selectedSite = selectedSiteId ? (sites.find((s) => s.id === selectedSiteId) ?? null) : null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="flex max-h-[90vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden rounded-none p-0 sm:max-w-5xl"
                style={{
                    background: CW.paper,
                    border: `1.5px solid ${CW.ink}`,
                    boxShadow: `10px 12px 0 ${CW.forest}, 0 40px 90px -30px rgba(20,15,12,0.8)`,
                }}
            >
                {/* Header */}
                <div
                    className="flex items-start justify-between"
                    style={{
                        background: CW.cream,
                        borderBottom: `2px solid ${CW.ink}`,
                        padding: "24px 30px 20px",
                    }}
                >
                    <div>
                        <div
                            className="font-mono-field font-medium uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.22em", color: CW.clay }}
                        >
                            § Watchlist · Site map &amp; details
                        </div>
                        <DialogTitle
                            className="font-poster font-black uppercase"
                            style={{ fontSize: 34, lineHeight: 0.92, letterSpacing: "-0.01em", marginTop: 9 }}
                        >
                            {campground?.name ?? ""}
                        </DialogTitle>
                        {campground?.area && (
                            <div
                                className="font-italic-serif italic"
                                style={{ fontSize: 16, color: CW.inkSoft, marginTop: 6 }}
                            >
                                {campground.area}
                            </div>
                        )}
                        {!loading && (
                            <div
                                className="font-mono-field font-semibold uppercase"
                                style={{
                                    fontSize: 10,
                                    letterSpacing: "0.12em",
                                    color: bookableCount > 0 ? CW.forest : CW.inkSoft,
                                    marginTop: 8,
                                }}
                            >
                                {bookableCount} of {totalSites} sites bookable
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="flex shrink-0 items-center justify-center rounded-[2px] transition-colors hover:bg-cw-ink [&:hover_svg]:stroke-cw-cream"
                        style={{
                            width: 38,
                            height: 38,
                            border: `1.5px solid ${CW.ink}`,
                            background: CW.paper,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16">
                            <path d="M3 3 L13 13 M13 3 L3 13" stroke={CW.ink} strokeWidth="1.8" fill="none" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto" style={{ padding: "24px 30px" }}>
                    {loading ? (
                        <div
                            className="font-mono-field uppercase"
                            style={{ fontSize: 11, letterSpacing: "0.1em", color: CW.inkSoft }}
                        >
                            Loading site details…
                        </div>
                    ) : sites.length === 0 ? (
                        <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                            Site details unavailable.
                        </div>
                    ) : (
                        /* 2-col layout: left = map + legend + summary; right = site list */
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(320px, 520px) 1fr",
                                gap: 24,
                                height: "100%",
                                minHeight: 500,
                            }}
                            className="map-modal-body"
                        >
                            {/* Left column: map + legend + summary */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                                {/* Map */}
                                <div
                                    style={{
                                        flex: "1 1 430px",
                                        borderRadius: 3,
                                        overflow: "hidden",
                                        border: `1px solid var(--cw-rule)`,
                                        position: "relative",
                                    }}
                                >
                                    <SiteMap
                                        sites={sites}
                                        selectedId={selectedSiteId}
                                        hoveredId={hoveredSiteId}
                                        onSelect={setSelectedSiteId}
                                        onHover={setHoveredSiteId}
                                    />
                                    {/* SitePopover — rendered inside the map column when a site is selected */}
                                    {selectedSite && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                bottom: 12,
                                                left: 12,
                                                zIndex: 1000,
                                            }}
                                        >
                                            <SitePopover
                                                site={selectedSite}
                                                onClose={() => setSelectedSiteId(null)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Legend */}
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 16,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                    }}
                                >
                                    <LegendItem glyph="●" color={CW.forest} label="Open" />
                                    <LegendItem glyph="○" color={CW.inkSoft} label="Booked" />
                                    <LegendItem glyph="★" color={CW.clay} label="Favorite" />
                                </div>

                                {/* At-a-glance summary */}
                                <MapSummary sites={sites} />
                            </div>

                            {/* Right column: site list */}
                            <div style={{ minWidth: 0, overflow: "hidden" }}>
                                <SiteList
                                    sites={sites}
                                    selectedId={selectedSiteId}
                                    hoveredId={hoveredSiteId}
                                    onSelect={setSelectedSiteId}
                                    onHover={setHoveredSiteId}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter
                    className="flex-row items-center justify-end gap-3 sm:justify-end"
                    style={{
                        background: CW.cream,
                        borderTop: `2px solid ${CW.ink}`,
                        padding: "18px 30px",
                        margin: 0,
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase transition-colors hover:bg-cw-ink hover:text-cw-cream"
                        style={{
                            fontSize: 12,
                            letterSpacing: "0.12em",
                            padding: "14px 22px",
                            background: CW.paper,
                            color: CW.ink,
                            border: `1.5px solid ${CW.ink}`,
                        }}
                    >
                        Close
                    </button>
                    {campground?.id && (
                        <a
                            href={`https://www.recreation.gov/camping/campgrounds/${campground.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cursor-pointer whitespace-nowrap rounded-[2px] font-poster font-extrabold uppercase no-underline transition-transform hover:-translate-x-px hover:-translate-y-px"
                            style={{
                                fontSize: 12,
                                letterSpacing: "0.12em",
                                padding: "14px 22px",
                                background: CW.forest,
                                color: CW.cream,
                                border: `1.5px solid ${CW.forest}`,
                                boxShadow: `3px 3px 0 ${CW.forestDeep}`,
                            }}
                        >
                            Recreation.gov →
                        </a>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function LegendItem({ glyph, color, label }: { glyph: string; color: string; label: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 12, color, lineHeight: 1 }}>{glyph}</span>
            <span
                className="font-mono-field font-medium uppercase"
                style={{ fontSize: 9, letterSpacing: "0.15em", color: CW.inkSoft }}
            >
                {label}
            </span>
        </div>
    );
}
