"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ProcessedCampground } from "@/types/campground";

interface AvailabilityStripProps {
    campground: ProcessedCampground;
    days?: number; // default 60
    showExcluded: boolean;
    className?: string;
}

interface DayCell {
    iso: string;
    label: string; // for aria + tooltip
    availableCount: number;
    excludedCount: number;
}

// Format a local date as YYYY-MM-DD without timezone drift.
function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildStrip(
    campground: ProcessedCampground,
    days: number,
): DayCell[] {
    // Pre-compute per-date counts across all sites.
    // SiteAvailability.matches: StayMatch[] — each match covers a range [from, to).
    // SiteAvailability.excludedMatches: ExcludedStay[] — filtered-out ranges.
    // We count a date as "available" if it falls within a match range (from <= date < to).
    // We count it as "excluded" if it falls within an excludedMatch range.

    // Build a quick lookup: iso => { available, excluded }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // We only care about dates in [today, today+days)
    const firstIso = toLocalIso(today);
    const lastDate = new Date(today);
    lastDate.setDate(today.getDate() + days - 1);
    const lastIso = toLocalIso(lastDate);

    const availableMap = new Map<string, number>();
    const excludedMap = new Map<string, number>();

    if (campground.siteAvailability) {
        for (const site of Object.values(campground.siteAvailability)) {
            // Count days from match ranges
            for (const match of site.matches ?? []) {
                // Walk from match.from to match.to (exclusive) and increment days that fall in our window
                const cursor = new Date(match.from + "T00:00:00");
                const end = new Date(match.to + "T00:00:00");
                while (cursor < end) {
                    const iso = toLocalIso(cursor);
                    if (iso >= firstIso && iso <= lastIso) {
                        availableMap.set(iso, (availableMap.get(iso) ?? 0) + 1);
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
            }

            // Count days from excludedMatches ranges (filtered-out but available)
            for (const excMatch of site.excludedMatches ?? []) {
                const cursor = new Date(excMatch.from + "T00:00:00");
                const end = new Date(excMatch.to + "T00:00:00");
                while (cursor < end) {
                    const iso = toLocalIso(cursor);
                    if (iso >= firstIso && iso <= lastIso) {
                        excludedMap.set(iso, (excludedMap.get(iso) ?? 0) + 1);
                    }
                    cursor.setDate(cursor.getDate() + 1);
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
        });
    }
    return cells;
}

export function AvailabilityStrip({
    campground,
    days = 60,
    showExcluded,
    className,
}: AvailabilityStripProps) {
    const cells = useMemo(
        () => buildStrip(campground, days),
        [campground, days],
    );

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
                                      backgroundColor: "var(--primary)",
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
