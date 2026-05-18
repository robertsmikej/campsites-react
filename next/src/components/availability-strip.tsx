"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

/** Keyed by siteName; missing entry means unrated. */
export type SiteRatingsMap = Record<string, "favorite" | "worthwhile">;

interface AvailabilityStripProps {
    campground?: ProcessedCampground;
    site?: SiteAvailability;
    days?: number; // default 60
    showExcluded: boolean;
    /** When provided in campground mode, colors each day by the best tier of any open site. */
    siteRatings?: SiteRatingsMap;
    className?: string;
}

type DayTier = "favorite" | "worthwhile" | "unrated";

interface DayCell {
    iso: string;
    label: string; // for aria + tooltip
    availableCount: number;
    excludedCount: number;
    /** Best tier of any available site on this day (campground mode only). */
    bestTier?: DayTier;
}

// Format a local date as YYYY-MM-DD without timezone drift.
function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildWindowBounds(days: number): { today: Date; firstIso: string; lastIso: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstIso = toLocalIso(today);
    const lastDate = new Date(today);
    lastDate.setDate(today.getDate() + days - 1);
    const lastIso = toLocalIso(lastDate);
    return { today, firstIso, lastIso };
}

function accumulateMatchDays(
    matches: Array<{ from: string; to: string }>,
    firstIso: string,
    lastIso: string,
    map: Map<string, number>,
    value = 1,
): void {
    for (const match of matches) {
        const cursor = new Date(match.from + "T00:00:00");
        const end = new Date(match.to + "T00:00:00");
        while (cursor < end) {
            const iso = toLocalIso(cursor);
            if (iso >= firstIso && iso <= lastIso) {
                map.set(iso, (map.get(iso) ?? 0) + value);
            }
            cursor.setDate(cursor.getDate() + 1);
        }
    }
}

function buildStripForCampground(
    campground: ProcessedCampground,
    days: number,
    siteRatings?: SiteRatingsMap,
): DayCell[] {
    // Pre-compute per-date counts across all sites.
    // SiteAvailability.matches: StayMatch[] — each match covers a range [from, to).
    // SiteAvailability.excludedMatches: ExcludedStay[] — filtered-out ranges.
    // We count a date as "available" if it falls within a match range (from <= date < to).
    // We count it as "excluded" if it falls within an excludedMatch range.

    const { today, firstIso, lastIso } = buildWindowBounds(days);
    const availableMap = new Map<string, number>();
    const excludedMap = new Map<string, number>();
    // Per-day best tier tracking (only used when siteRatings is provided)
    const tierMap = new Map<string, DayTier>();

    const tierRank: Record<DayTier, number> = { favorite: 2, worthwhile: 1, unrated: 0 };

    if (campground.siteAvailability) {
        for (const site of Object.values(campground.siteAvailability)) {
            accumulateMatchDays(site.matches ?? [], firstIso, lastIso, availableMap);
            accumulateMatchDays(site.excludedMatches ?? [], firstIso, lastIso, excludedMap);

            if (siteRatings) {
                const siteTier: DayTier = siteRatings[site.siteName] ?? "unrated";
                // Walk each match range and track best tier per day
                for (const match of site.matches ?? []) {
                    const cursor = new Date(match.from + "T00:00:00");
                    const end = new Date(match.to + "T00:00:00");
                    while (cursor < end) {
                        const iso = toLocalIso(cursor);
                        if (iso >= firstIso && iso <= lastIso) {
                            const current = tierMap.get(iso);
                            if (!current || tierRank[siteTier] > tierRank[current]) {
                                tierMap.set(iso, siteTier);
                            }
                        }
                        cursor.setDate(cursor.getDate() + 1);
                    }
                }
            }
        }
    }

    const cells: DayCell[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = toLocalIso(d);
        cells.push({
            iso,
            label: d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
            }),
            availableCount: availableMap.get(iso) ?? 0,
            excludedCount: excludedMap.get(iso) ?? 0,
            bestTier: tierMap.get(iso),
        });
    }
    return cells;
}

function buildStripForSite(
    site: SiteAvailability,
    days: number,
): DayCell[] {
    // For a single site, counts are binary: 0 or 1 per day.
    const { today, firstIso, lastIso } = buildWindowBounds(days);
    const availableMap = new Map<string, number>();
    const excludedMap = new Map<string, number>();

    accumulateMatchDays(site.matches ?? [], firstIso, lastIso, availableMap);
    accumulateMatchDays(site.excludedMatches ?? [], firstIso, lastIso, excludedMap);

    const cells: DayCell[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = toLocalIso(d);
        cells.push({
            iso,
            label: d.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
            }),
            availableCount: availableMap.get(iso) ?? 0,
            excludedCount: excludedMap.get(iso) ?? 0,
        });
    }
    return cells;
}

// Colors used for tier-based campground strip bars
const TIER_COLOR: Record<DayTier, string> = {
    favorite: "oklch(0.55 0.15 145)",   // forest green
    worthwhile: "oklch(0.78 0.16 80)",  // warm yellow
    unrated: "var(--primary)",          // default forest
};

export function AvailabilityStrip({
    campground,
    site,
    days = 60,
    showExcluded,
    siteRatings,
    className,
}: AvailabilityStripProps) {
    const cells = useMemo(() => {
        if (site) return buildStripForSite(site, days);
        if (campground) return buildStripForCampground(campground, days, siteRatings);
        return [];
    }, [campground, site, days, siteRatings]);

    // Normalize intensity against the max available count
    const maxAvail = Math.max(1, ...cells.map((c) => c.availableCount));

    return (
        <div
            className={cn(
                "flex h-8 items-end gap-px overflow-hidden rounded-md bg-muted/40 p-1",
                className,
            )}
            aria-label={`Availability over next ${days} days`}
        >
            {cells.map((cell) => {
                const isWeekStart =
                    new Date(cell.iso + "T00:00:00").getDay() === 0;
                const intensity =
                    cell.availableCount > 0
                        ? Math.min(1, cell.availableCount / maxAvail)
                        : 0;
                // Show excluded accent only if toggle is on and there's excluded data but no hard availability
                const showExc =
                    showExcluded &&
                    cell.excludedCount > 0 &&
                    cell.availableCount === 0;

                // In campground mode with ratings, use tier color; otherwise fall back to primary
                const barColor =
                    siteRatings && cell.bestTier
                        ? TIER_COLOR[cell.bestTier]
                        : "var(--primary)";

                return (
                    <div
                        key={cell.iso}
                        title={`${cell.label} — ${cell.availableCount} available${
                            cell.excludedCount > 0
                                ? ` (${cell.excludedCount} filtered)`
                                : ""
                        }`}
                        className={cn(
                            "flex-1 rounded-sm transition-all",
                            isWeekStart && "border-l border-border/50",
                        )}
                        style={
                            intensity > 0
                                ? {
                                      backgroundColor: barColor,
                                      opacity: 0.35 + intensity * 0.65,
                                      height: `${30 + intensity * 70}%`,
                                  }
                                : showExc
                                  ? {
                                        backgroundColor: "var(--accent)",
                                        opacity: 0.6,
                                        height: "40%",
                                    }
                                  : {
                                        height: "10%",
                                        backgroundColor:
                                            "var(--muted-foreground)",
                                        opacity: 0.15,
                                    }
                        }
                    />
                );
            })}
        </div>
    );
}
