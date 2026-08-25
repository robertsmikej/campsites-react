import type { Campground } from "@/types/campground";

/** A named group of campgrounds that share a timeline section. */
export interface CampgroundGroup<T extends Campground = Campground> {
    /** Display label. Empty string for the default (ungrouped) bucket. */
    name: string;
    campgrounds: T[];
    /** Derived date range: earliest startDate to latest endDate across all
     *  campgrounds in the group. Absent when no campground has dates set. */
    dateRange: { start: string; end: string } | null;
}

const DEFAULT_GROUP = "";

/** Partition campgrounds by their `group` field. Returns an ordered array:
 *  named groups first (in the order their first campground appears), then
 *  the default (ungrouped) bucket last. Within each group the original
 *  order is preserved. */
export function groupCampgrounds<T extends Campground>(campgrounds: T[]): CampgroundGroup<T>[] {
    const buckets = new Map<string, T[]>();
    const order: string[] = [];

    for (const cg of campgrounds) {
        const key = cg.group?.trim() || DEFAULT_GROUP;
        if (!buckets.has(key)) {
            buckets.set(key, []);
            order.push(key);
        }
        buckets.get(key)!.push(cg);
    }

    // Named groups first, default (ungrouped) bucket last.
    const sorted = order.sort((a, b) => {
        if (a === DEFAULT_GROUP) return 1;
        if (b === DEFAULT_GROUP) return -1;
        return 0; // named groups stay in insertion order
    });

    return sorted.map((key) => {
        const cgs = buckets.get(key)!;
        return {
            name: key,
            campgrounds: cgs,
            dateRange: deriveDateRange(cgs),
        };
    });
}

/** Earliest startDate and latest endDate across the group's campgrounds. */
function deriveDateRange(campgrounds: Campground[]): { start: string; end: string } | null {
    let earliest: string | null = null;
    let latest: string | null = null;

    for (const cg of campgrounds) {
        const s = cg.dates?.startDate;
        const e = cg.dates?.endDate;
        if (s && (!earliest || s < earliest)) earliest = s;
        if (e && (!latest || e > latest)) latest = e;
    }

    if (!earliest || !latest) return null;
    return { start: earliest, end: latest };
}
