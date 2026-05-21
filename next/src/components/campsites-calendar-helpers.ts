import type { SiteAvailability } from "@/types/campground";

export type DayVariant =
    | "single"
    | "rangeStart"
    | "rangeMiddle"
    | "rangeEnd"
    | "softSingle"
    | "softRangeStart"
    | "softRangeMiddle"
    | "softRangeEnd"
    | "excludedSingle"
    | "excludedRangeStart"
    | "excludedRangeMiddle"
    | "excludedRangeEnd";

export interface DisplayRange {
    from: string;
    to: string;
    soft?: boolean;
    excluded?: boolean;
}

// ---------------------------------------------------------------------------
// ISO date string helpers — no dayjs, no timezone drift
// ---------------------------------------------------------------------------

/** Parse an ISO date string "YYYY-MM-DD" into a UTC midnight Date. */
function parseUTC(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

/** Format a UTC Date as "YYYY-MM-DD". */
function fmtUTC(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Return the first day of the month for a given ISO date string. */
function startOfMonthISO(iso: string): string {
    const [y, m] = iso.split("-");
    return `${y}-${m}-01`;
}

/** Add one month (UTC) to a "YYYY-MM-01" string. */
function addOneMonthISO(iso: string): string {
    const d = parseUTC(iso);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return fmtUTC(d);
}

/** Compare two ISO date strings. Returns negative / 0 / positive. */
function cmpISO(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** Iterate each calendar day from `from` up to AND INCLUDING `to`. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function* eachDayInclusive(from: string, to: string): Generator<string> {
    const cursor = parseUTC(from);
    const end = parseUTC(to);
    while (cursor <= end) {
        yield fmtUTC(cursor);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
}

/** Iterate each calendar day from `from` STRICTLY BEFORE `to`. */
function* eachDayBefore(from: string, to: string): Generator<string> {
    const cursor = parseUTC(from);
    const end = parseUTC(to);
    while (cursor < end) {
        yield fmtUTC(cursor);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
}

/** Add one day to an ISO string. */
function addOneDay(iso: string): string {
    const d = parseUTC(iso);
    d.setUTCDate(d.getUTCDate() + 1);
    return fmtUTC(d);
}

// ---------------------------------------------------------------------------
// buildVariantMap
// ---------------------------------------------------------------------------

function addRangeToMap(
    map: Map<string, DayVariant>,
    from: string,
    to: string,
    prefix: "soft" | "excluded" | "",
) {
    const single = `${prefix}${prefix ? "Single" : "single"}` as DayVariant;
    const rangeStart = `${prefix}${prefix ? "RangeStart" : "rangeStart"}` as DayVariant;
    const rangeMiddle = `${prefix}${prefix ? "RangeMiddle" : "rangeMiddle"}` as DayVariant;
    const rangeEnd = `${prefix}${prefix ? "RangeEnd" : "rangeEnd"}` as DayVariant;

    if (from === to) {
        map.set(from, single);
        return;
    }
    map.set(from, rangeStart);
    map.set(to, rangeEnd);

    // middle days: strictly after `from`, strictly before `to`
    const cursor = parseUTC(from);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const end = parseUTC(to);
    while (cursor < end) {
        map.set(fmtUTC(cursor), rangeMiddle);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
}

/**
 * Pre-compute a Map<YYYY-MM-DD, DayVariant> from the display ranges.
 * Priority order (highest wins): regular > soft > excluded.
 */
export function buildVariantMap(values: DisplayRange[]): Map<string, DayVariant> {
    const map = new Map<string, DayVariant>();

    // 1. Excluded — lowest priority
    for (const item of values) {
        if (!item?.excluded) continue;
        if (item.from && item.to) addRangeToMap(map, item.from, item.to, "excluded");
    }

    // 2. Soft — medium priority
    for (const item of values) {
        if (!item?.soft) continue;
        if (item.from && item.to) addRangeToMap(map, item.from, item.to, "soft");
    }

    // 3. Regular matches — highest priority
    for (const item of values) {
        if (item?.excluded || item?.soft) continue;
        if (item.from && item.to) addRangeToMap(map, item.from, item.to, "");
    }

    return map;
}

// ---------------------------------------------------------------------------
// buildDateDisplayArray
// ---------------------------------------------------------------------------

/**
 * Given a site and whether to include stayLength-excluded matches, return
 * the sorted list of display ranges used to paint the calendar.
 *
 * Mirrors the CRA buildDateDisplayArray:
 *   - Regular match ranges (including single-day matches as a range from→to)
 *   - startDay-excluded as soft (lighter green)
 *   - stayLength-excluded as orange when includeExcluded is true
 *   - Single available dates not covered by any range also become soft entries
 *     with to = from + 1 day (to mirror CRA's `dayjs(d).add(1, 'day')`)
 */
export function buildDateDisplayArray(site: SiteAvailability, includeExcluded: boolean): DisplayRange[] {
    const { dates = [], matches = [], excludedMatches = [] } = site;

    // Regular match ranges
    const matchRanges: DisplayRange[] = matches.map((m) => ({ from: m.from, to: m.to }));

    // startDay-excluded → soft (always shown)
    const softRanges: DisplayRange[] = excludedMatches
        .filter((m) => m.reason === "startDay")
        .map((m) => ({ from: m.from, to: m.to, soft: true }));

    // stayLength-excluded → orange (only when toggled)
    const excludedRanges: DisplayRange[] = includeExcluded
        ? excludedMatches
              .filter((m) => m.reason !== "startDay")
              .map((m) => ({ from: m.from, to: m.to, excluded: true }))
        : [];

    // Collect all days covered by any match or soft range
    const allMatchDays = new Set<string>();
    const addRangeDays = (from: string, to: string) => {
        // CRA: `while current.isBefore(end, 'day')` — excludes the last day
        for (const day of eachDayBefore(from, to)) {
            allMatchDays.add(day);
        }
    };
    matches.forEach((m) => addRangeDays(m.from, m.to));
    excludedMatches.filter((m) => m.reason === "startDay").forEach((m) => addRangeDays(m.from, m.to));
    if (includeExcluded) {
        excludedMatches.filter((m) => m.reason !== "startDay").forEach((m) => addRangeDays(m.from, m.to));
    }

    // Single available dates not covered by any match range → soft with to = from + 1 day
    const singles: DisplayRange[] = dates
        .filter((d) => !allMatchDays.has(d))
        .map((d) => ({ from: d, to: addOneDay(d), soft: true }));

    const combined: DisplayRange[] = [...singles, ...matchRanges, ...softRanges, ...excludedRanges];

    // Sort by from date
    combined.sort((a, b) => cmpISO(a.from, b.from));

    return combined;
}

// ---------------------------------------------------------------------------
// getMonthsFromSiteData
// ---------------------------------------------------------------------------

/**
 * Returns the ISO string for the first day of each month that has any data
 * to show (dates, matches, or excluded matches depending on includeExcluded).
 * Sorted chronologically.
 */
export function getMonthsFromSiteData(site: SiteAvailability, includeExcluded: boolean): string[] {
    const { dates = [], matches = [], excludedMatches = [] } = site;
    const startDayExcluded = excludedMatches.filter((m) => m.reason === "startDay");
    const stayLengthExcluded = includeExcluded ? excludedMatches.filter((m) => m.reason !== "startDay") : [];
    const allMatches = [...matches, ...startDayExcluded, ...stayLengthExcluded];

    const monthsSet = new Set<string>();

    // Months from individual dates
    dates.forEach((dateStr) => {
        monthsSet.add(startOfMonthISO(dateStr));
    });

    // Months from match ranges — walk from start month to end month
    allMatches.forEach((m) => {
        let current = startOfMonthISO(m.from);
        const end = startOfMonthISO(m.to);
        while (cmpISO(current, end) <= 0) {
            monthsSet.add(current);
            current = addOneMonthISO(current);
        }
    });

    return [...monthsSet].sort(cmpISO);
}
