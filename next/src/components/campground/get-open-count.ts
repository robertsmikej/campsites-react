import type { ProcessedCampground } from "@/types/campground";

/**
 * Format a local date as YYYY-MM-DD without timezone drift.
 * Duplicated from dashboard/helpers.ts to avoid a cross-tree import;
 * callers within the campground atom tree use this copy.
 */
export function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Count the number of available stay-matches for a campground within an
 * optional date window.  When no window is supplied, all matches are counted.
 *
 * The same arithmetic is used by:
 *   - CampgroundRow (inline, for the open-count badge)
 *   - app/page.tsx  (for the openCounts map fed to WatchlistRow)
 *   - campgrounds-list.tsx (for sorting by availability)
 *
 * Formula: match overlaps the window when match.from <= winEnd AND match.to > winStart.
 */
export function getCampgroundOpenCount(
    campground: ProcessedCampground,
    windowStart?: Date,
    windowEnd?: Date,
): number {
    return Object.values(campground.siteAvailability ?? {}).reduce((acc, site) => {
        if (!windowStart || !windowEnd) {
            return acc + (site.matches?.length ?? 0);
        }
        const winStartIso = toLocalIso(windowStart);
        const winEndIso = toLocalIso(windowEnd);
        return acc + (site.matches ?? []).filter((m) => m.from <= winEndIso && m.to > winStartIso).length;
    }, 0);
}
