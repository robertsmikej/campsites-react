import {
    IGNORE_CAMPSITE_TYPES,
    type ProcessSettings,
    type RawMonthResult,
    type SiteAvailabilityMap,
    type StayMatch,
} from "./types";

export const getAllDatesInRange = (start: string, end: string): string[] => {
    const result: string[] = [];
    const current = new Date(start);
    const final = new Date(end);
    while (current <= final) {
        result.push(current.toISOString().split("T")[0] ?? "");
        current.setDate(current.getDate() + 1);
    }
    return result;
};

const MS_PER_DAY = 86400000;

const isConsecutiveRun = (timestamps: number[], start: number, length: number): boolean => {
    const startTs = timestamps[start] ?? 0;
    for (let j = 1; j < length; j++) {
        if ((timestamps[start + j] ?? -1) !== startTs + j * MS_PER_DAY) {
            return false;
        }
    }
    return true;
};

const isoDate = (ts: number): string => new Date(ts).toISOString().split("T")[0] ?? "";

/**
 * Finds `length`-night stays over the sorted `dates`. After accepting a window the
 * scan jumps past it (one alert per block, not one per night), but a window that
 * fails `isValidStart` is stepped over one day at a time so a valid start day
 * hidden inside a rejected window is still found. Without the predicate every
 * consecutive window is accepted.
 */
export const findConsecutiveAvailableRanges = (
    dates: string[],
    length: number,
    isValidStart: (from: string) => boolean = () => true,
): [string, string][] => {
    const ranges: [string, string][] = [];
    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let i = 0; i <= timestamps.length - length; ) {
        if (!isConsecutiveRun(timestamps, i, length)) {
            i++;
            continue;
        }
        const from = isoDate(timestamps[i] ?? 0);
        if (!isValidStart(from)) {
            i++;
            continue;
        }
        const lastTs = timestamps[i + length - 1] ?? 0;
        ranges.push([from, isoDate(lastTs + MS_PER_DAY)]);
        i += length;
    }
    return ranges;
};

const weekdayNameOf = (isoDay: string): string => {
    const parts = isoDay.split("-").map(Number);
    const y = parts[0] ?? 0;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
};

const filterNonOverlapping = (matches: StayMatch[]): StayMatch[] => {
    const sorted = [...matches].sort((a, b) => b.nights - a.nights);
    const filtered: StayMatch[] = [];
    for (const match of sorted) {
        const matchStart = new Date(match.from);
        const matchEnd = new Date(match.to);
        const isContained = filtered.some(({ from, to }) => {
            const existingStart = new Date(from);
            const existingEnd = new Date(to);
            return matchStart >= existingStart && matchEnd <= existingEnd;
        });
        if (!isContained) filtered.push(match);
    }
    return filtered;
};

export const processCampgroundResults = (
    apiResults: (RawMonthResult | null)[],
    allDates: string[],
    settings: ProcessSettings,
): SiteAvailabilityMap => {
    const siteAvailability: SiteAvailabilityMap = {};
    const minStay = Math.min(...(settings.stayLengths ?? [2]));
    const maxStay = Math.max(...(settings.stayLengths ?? [5]));

    for (const data of apiResults) {
        if (!data?.campsites) continue;
        for (const [siteId, siteData] of Object.entries(data.campsites)) {
            if (IGNORE_CAMPSITE_TYPES.includes(siteData.campsite_type)) continue;
            if (!siteAvailability[siteId]) {
                siteAvailability[siteId] = {
                    siteId,
                    siteName: siteData.site,
                    campsite_type: siteData.campsite_type,
                    dates: [],
                };
            }
            const validDates = Object.entries(siteData.availabilities)
                .filter(([, status]) => status === "Available")
                .map(([date]) => date.split("T")[0] ?? "")
                .filter((date) => allDates.includes(date));
            siteAvailability[siteId]?.dates.push(...validDates);
        }
    }

    for (const siteId in siteAvailability) {
        const site = siteAvailability[siteId];
        if (!site) continue;
        const uniqueDates = [...new Set(site.dates)].sort();
        const stayMatches: StayMatch[] = [];
        const isValidStartDay = (from: string): boolean =>
            !settings.validStartDays?.length || settings.validStartDays.includes(weekdayNameOf(from));
        for (let length = minStay; length <= maxStay; length++) {
            for (const [from, to] of findConsecutiveAvailableRanges(uniqueDates, length, isValidStartDay)) {
                stayMatches.push({ from, to, nights: length });
            }
        }
        site.matches = filterNonOverlapping(stayMatches);
        delete (site as Partial<typeof site>).dates;
    }

    return siteAvailability;
};
