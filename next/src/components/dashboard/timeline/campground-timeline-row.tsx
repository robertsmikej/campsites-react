"use client";

import { Fragment, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import {
    type Horizon,
    TIER_MARK,
    buildDisplaySites,
    campgroundRuns,
    siteFeature,
    siteOpenRuns,
} from "@/lib/timeline";
import type { BlackoutRange, ProcessedCampground } from "@/types/campground";
import { TimelineTrack } from "./timeline-track";
import { SiteWindowsList } from "./site-windows";

const META = 264;
const PAD = 26;

interface CampgroundTimelineRowProps {
    campground: ProcessedCampground;
    horizon: Horizon;
    expanded: boolean;
    onToggleExpand: () => void;
    onEditSettings?: (campgroundId: string) => void;
    onOpenMap?: (campgroundId: string) => void;
    /** full site roster (all site labels) so every site can show, not just open/tagged */
    roster?: string[];
    /** user's blackout ranges — passed down to timeline blocks for per-night grey */
    blackoutDates?: BlackoutRange[];
}

export function CampgroundTimelineRow({
    campground,
    horizon,
    expanded,
    onToggleExpand,
    onEditSettings,
    onOpenMap,
    roster,
    blackoutDates,
}: CampgroundTimelineRowProps) {
    const [openSites, setOpenSites] = useState<Set<string>>(new Set());
    const toggleSite = (id: string) =>
        setOpenSites((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const runs = campgroundRuns(horizon, campground);
    const favN = campground.sites?.favorites?.length ?? 0;
    const worthN = campground.sites?.worthwhile?.length ?? 0;
    const totalSites = campground.totalSitesCount ?? Object.keys(campground.siteAvailability ?? {}).length;
    const favOpenCount = (campground.sites?.favorites ?? []).filter((name) => {
        const site = Object.values(campground.siteAvailability ?? {}).find((s) => s.siteName === name);
        return site ? siteOpenRuns(horizon, site).length > 0 : false;
    }).length;

    let count: string;
    let countColor: string;
    if (runs.openNights > 0) {
        count = `${runs.openNights} nights open`;
        countColor = CW.forest;
    } else if (runs.limitedNights > 0) {
        count = "limited only";
        countColor = CW.mustard;
    } else {
        count = "watching";
        countColor = CW.inkSoft;
    }

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                onClick={onToggleExpand}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleExpand();
                    }
                }}
                className="grid cursor-pointer items-stretch border-b border-dotted hover:bg-[color-mix(in_srgb,var(--cw-forest)_3%,transparent)]"
                style={{ gridTemplateColumns: `${META}px 1fr`, borderColor: CW.rule }}
            >
                <div
                    className="relative flex flex-col justify-center"
                    style={{ padding: `16px ${PAD}px`, borderRight: `1px solid ${CW.rule}` }}
                >
                    <div className="absolute right-3 top-3 flex items-center gap-1">
                        {onOpenMap && campground.id && (
                            <button
                                type="button"
                                aria-label={`Map & sites for ${campground.name}`}
                                title="Map & sites"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenMap(campground.id);
                                }}
                                className="font-mono-field font-semibold uppercase opacity-50 transition-opacity hover:opacity-100"
                                style={{ fontSize: 9, letterSpacing: "0.1em", color: CW.inkSoft }}
                            >
                                Map
                            </button>
                        )}
                        {onEditSettings && campground.id && (
                            <button
                                type="button"
                                aria-label={`Configure ${campground.name}`}
                                title="Configure"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditSettings(campground.id);
                                }}
                                className="opacity-50 transition-opacity hover:opacity-100"
                                style={{ color: CW.inkSoft }}
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                >
                                    <path d="M11.5 2.5 L13.5 4.5 L5 13 L2.5 13.5 L3 11 Z" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <div
                        className="font-italic-serif italic leading-[1.08]"
                        style={{ fontSize: 22, color: CW.ink }}
                    >
                        {favN > 0 && <span style={{ color: CW.clay, marginRight: 7 }}>★</span>}
                        {campground.name}
                    </div>
                    {campground.area && (
                        <div
                            className="font-body-serif"
                            style={{ fontSize: 11, color: CW.inkSoft, marginTop: 4 }}
                        >
                            {campground.area}
                        </div>
                    )}
                    <div
                        className="font-mono-field font-semibold uppercase leading-none"
                        style={{ fontSize: 10, letterSpacing: "0.1em", color: countColor, marginTop: 9 }}
                    >
                        {count}
                        <span style={{ color: CW.clay, fontWeight: 500 }}>
                            {" · "}
                            {totalSites} sites{" "}
                            <span
                                className="inline-block transition-transform"
                                style={{ fontSize: 9, transform: expanded ? "rotate(180deg)" : undefined }}
                            >
                                ▾
                            </span>
                        </span>
                    </div>
                    {(favN > 0 || worthN > 0 || favOpenCount > 0) && (
                        <div className="mt-[7px] flex flex-wrap items-center gap-[9px]">
                            {favN > 0 && (
                                <span
                                    className="font-mono-field font-bold"
                                    style={{ fontSize: 11, color: CW.clay }}
                                >
                                    ★{favN}
                                </span>
                            )}
                            {worthN > 0 && (
                                <span
                                    className="font-mono-field font-bold"
                                    style={{ fontSize: 11, color: CW.forest }}
                                >
                                    ◇{worthN}
                                </span>
                            )}
                            {favOpenCount > 0 && (
                                <span
                                    className="font-mono-field font-bold uppercase"
                                    style={{
                                        fontSize: 9,
                                        letterSpacing: "0.1em",
                                        color: CW.clay,
                                        border: `1px solid ${CW.clay}`,
                                        borderRadius: 999,
                                        padding: "4px 7px",
                                    }}
                                >
                                    ★ {favOpenCount} open
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <TimelineTrack
                    horizon={horizon}
                    open={runs.open}
                    limited={runs.limited}
                    pad={PAD}
                    blackoutDates={blackoutDates}
                />
            </div>

            {expanded && (
                <div
                    style={{
                        background: "color-mix(in srgb, var(--cw-ink) 2%, transparent)",
                        boxShadow: `inset 0 1px 0 ${CW.rule}, inset 0 -1px 0 ${CW.rule}`,
                    }}
                >
                    {buildDisplaySites(campground, roster).map(({ site, tier }) => {
                        const hasOpen = siteOpenRuns(horizon, site).length > 0;
                        const showWindows = openSites.has(site.siteId);
                        return (
                            <Fragment key={site.siteId}>
                                <div
                                    role={hasOpen ? "button" : undefined}
                                    tabIndex={hasOpen ? 0 : undefined}
                                    onClick={hasOpen ? () => toggleSite(site.siteId) : undefined}
                                    onKeyDown={
                                        hasOpen
                                            ? (e) => {
                                                  if (e.key === "Enter" || e.key === " ") {
                                                      e.preventDefault();
                                                      toggleSite(site.siteId);
                                                  }
                                              }
                                            : undefined
                                    }
                                    className="grid items-stretch border-b border-dotted last:border-b-0"
                                    style={{
                                        gridTemplateColumns: `${META}px 1fr`,
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
                                    <div
                                        className="relative flex items-baseline gap-2"
                                        style={{
                                            padding: `9px ${PAD}px 9px ${PAD + 24}px`,
                                            borderRight: `1px solid ${CW.rule}`,
                                        }}
                                    >
                                        <span
                                            className="absolute"
                                            style={{
                                                left: PAD + 4,
                                                top: "50%",
                                                width: 9,
                                                height: 1,
                                                background: CW.inkFaint,
                                            }}
                                        />
                                        <span
                                            className="font-mono-field font-bold"
                                            style={{
                                                fontSize: 13,
                                                width: 13,
                                                textAlign: "center",
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
                                            className="font-mono-field font-semibold whitespace-nowrap"
                                            style={{
                                                fontSize: 12,
                                                letterSpacing: "0.04em",
                                                color: CW.ink,
                                            }}
                                        >
                                            Site {site.siteName}
                                        </span>
                                        <span
                                            className="overflow-hidden font-italic-serif italic text-ellipsis whitespace-nowrap"
                                            style={{ fontSize: 15, color: CW.inkSoft }}
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
                                </div>
                                {hasOpen && showWindows && (
                                    <div style={{ borderBottom: `1px dotted ${CW.ruleSoft}` }}>
                                        <SiteWindowsList horizon={horizon} site={site} indent={PAD + 24} />
                                    </div>
                                )}
                            </Fragment>
                        );
                    })}
                </div>
            )}
        </>
    );
}
