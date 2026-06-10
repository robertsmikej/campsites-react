import type { BlackoutRange } from "@/types/campground";

// ISO YYYY-MM-DD strings compare correctly as strings — no Date parsing needed.

/** True when the calendar day falls inside any inclusive blackout range. */
export function isDateBlackedOut(isoDate: string, ranges: BlackoutRange[] | undefined): boolean {
    if (!ranges || ranges.length === 0) return false;
    return ranges.some((r) => r.from <= isoDate && isoDate <= r.to);
}

/** True when any NIGHT of the stay (dates d with from <= d < to) is blacked out.
 *  Checkout on a blackout's first morning is fine; so is check-in the day after
 *  one ends. Walks nights without Date math by comparing range bounds:
 *  a range overlaps the night-interval [from, to) iff r.from < to && from <= r.to. */
export function stayOverlapsBlackout(
    stayFrom: string,
    stayTo: string,
    ranges: BlackoutRange[] | undefined,
): boolean {
    if (!ranges || ranges.length === 0) return false;
    return ranges.some((r) => r.from < stayTo && stayFrom <= r.to);
}
