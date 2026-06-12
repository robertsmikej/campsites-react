"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { CW } from "@/components/field-notes/cw-tokens";
import { mergeMapSites, type MapSite } from "@/lib/map-sites";
import type { SiteDetail } from "@/lib/site-details";
import type { ProcessedCampground } from "@/types/campground";
import type { JSX } from "react";

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

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="flex max-h-[90vh] w-[95vw] max-w-[95vw] flex-col overflow-hidden rounded-none p-0 sm:max-w-4xl"
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
                        <div className="font-mono-field" style={{ fontSize: 11, color: CW.inkSoft }}>
                            {/* Map and site list will be wired in Tasks 6–7 */}
                            {sites.length} sites loaded.
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
