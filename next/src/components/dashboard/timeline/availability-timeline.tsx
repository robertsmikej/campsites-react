"use client";

import { useEffect, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { buildHorizon, clampWindowStart } from "@/lib/timeline";
import { useCampgroundSites } from "@/hooks/use-campground-sites";
import { useSiteSettings } from "@/contexts/site-settings";
import type { ProcessedCampground } from "@/types/campground";
import { TimelineAxis } from "./timeline-axis";
import { CampgroundTimelineRow } from "./campground-timeline-row";
import { CampgroundMapModal } from "@/components/dashboard/map-modal/campground-map-modal";

const META = 264;
const PAD = 26;

interface AvailabilityTimelineProps {
    rows: ProcessedCampground[];
    dateRange: { start: Date; end: Date };
    defaultExpandFirst?: boolean;
    onEditSettings?: (campgroundId: string) => void;
    addHref?: (campgroundId: string) => string;
}

export function AvailabilityTimeline({
    rows,
    dateRange,
    defaultExpandFirst,
    onEditSettings,
    addHref,
}: AvailabilityTimelineProps) {
    const view = clampWindowStart(dateRange);
    const horizon = buildHorizon(view.start, view.end);
    const { sitesById, ensureLoaded } = useCampgroundSites();
    const blackoutDates = useSiteSettings()?.dates.blackoutDates;
    const [mapCgId, setMapCgId] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const first = defaultExpandFirst ? rows[0]?.id : undefined;
        return first ? new Set([first]) : new Set();
    });

    // Lazily fetch the full site roster for an expanded campground so every site
    // shows (not just the open + tagged ones). Cached server-side; gentle.
    useEffect(() => {
        for (const cg of rows) {
            if (cg.id && expandedIds.has(cg.id ?? cg.name)) ensureLoaded(cg.id);
        }
    }, [expandedIds, rows, ensureLoaded]);

    const toggle = (id: string) =>
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    return (
        <>
            <div
                className="overflow-hidden bg-cw-cream"
                style={{ border: `1.5px solid ${CW.ink}`, boxShadow: `8px 8px 0 ${CW.forest}` }}
            >
                <div
                    className="grid items-end"
                    style={{
                        gridTemplateColumns: `${META}px 1fr`,
                        borderBottom: `2px solid ${CW.ink}`,
                        padding: `18px ${PAD}px 0`,
                    }}
                >
                    <div
                        className="font-mono-field font-bold uppercase"
                        style={{ fontSize: 10, letterSpacing: "0.16em", color: CW.clay, paddingBottom: 12 }}
                    >
                        Watchlist · click a row to expand its sites
                    </div>
                    <TimelineAxis horizon={horizon} />
                </div>

                <div>
                    {rows.map((cg) => (
                        <CampgroundTimelineRow
                            key={cg.id ?? cg.name}
                            campground={cg}
                            horizon={horizon}
                            expanded={expandedIds.has(cg.id ?? cg.name)}
                            onToggleExpand={() => toggle(cg.id ?? cg.name)}
                            onEditSettings={onEditSettings}
                            onOpenMap={setMapCgId}
                            addHref={addHref}
                            roster={cg.id ? sitesById[cg.id] : undefined}
                            blackoutDates={blackoutDates}
                        />
                    ))}
                </div>

                <div
                    className="flex items-center justify-between"
                    style={{
                        borderTop: `2px solid ${CW.ink}`,
                        background: CW.paper,
                        padding: `14px ${PAD}px`,
                    }}
                >
                    <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                        One axis, every campground on it.
                    </div>
                    <div
                        className="font-mono-field uppercase"
                        style={{ fontSize: 11, letterSpacing: "0.12em", color: CW.clay }}
                    >
                        Updated every 5 min
                    </div>
                </div>
            </div>
            <CampgroundMapModal
                campground={rows.find((c) => c.id === mapCgId) ?? null}
                open={mapCgId !== null}
                onClose={() => setMapCgId(null)}
            />
        </>
    );
}
