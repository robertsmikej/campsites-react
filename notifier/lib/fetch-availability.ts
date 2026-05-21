// Port of core fetch + match detection logic from src/calls/fetchCampgroundData.jsx
// Uses native fetch (Node 18+) instead of axios. No dependencies required.

import type { StayMatch } from "../../next/src/types/campground";

const IGNORE_TYPES = ["GROUP SHELTER NONELECTRIC", "WALK TO", "DAY USE"];

// ── Internal types ────────────────────────────────────────────────────────────

export interface SiteAvailabilityRaw {
    siteId: string;
    siteName: string;
    campsite_type: string;
    dates: string[];
    matches?: StayMatch[];
}

export interface ProcessSettings {
    stayLengths?: number[];
    validStartDays?: string[];
}

// rec.gov API shape (partial — only what we use)
interface RecGovSiteData {
    site: string;
    campsite_type: string;
    availabilities: Record<string, string>;
}

interface RecGovMonthResult {
    campsites?: Record<string, RecGovSiteData>;
}

// Keyed by siteId
export type SiteAvailabilityMap = Record<string, SiteAvailabilityRaw>;

// ── Exported helpers ──────────────────────────────────────────────────────────

// Copied from src/calls/fetchCampgroundData.jsx (line 469)
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

// Copied from src/calls/fetchCampgroundData.jsx (line 480)
export const findConsecutiveAvailableRanges = (dates: string[], length: number): [string, string][] => {
    const ranges: [string, string][] = [];
    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let i = 0; i <= timestamps.length - length; ) {
        const iTs = timestamps[i] ?? 0;
        let isConsecutive = true;
        for (let j = 1; j < length; j++) {
            const expected = iTs + j * 86400000;
            if ((timestamps[i + j] ?? -1) !== expected) {
                isConsecutive = false;
                break;
            }
        }
        if (isConsecutive) {
            const from = new Date(iTs).toISOString().split("T")[0] ?? "";
            const lastTs = timestamps[i + length - 1] ?? iTs;
            const toDate = new Date(lastTs);
            toDate.setDate(toDate.getDate() + 1);
            const to = toDate.toISOString().split("T")[0] ?? "";
            ranges.push([from, to]);
            i += length;
        } else {
            i++;
        }
    }
    return ranges;
};

// Remove matches that are fully contained within a longer match
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

// Fetch a single month of availability data for a campground
export const fetchMonth = async (facilityId: string, month: string): Promise<RecGovMonthResult | null> => {
    const formattedMonth = `${month}-01T00%3A00%3A00.000Z`;
    const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${formattedMonth}`;
    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            console.error(`[Fetch] HTTP ${response.status} for ${facilityId} month ${month}`);
            return null;
        }
        return (await response.json()) as RecGovMonthResult;
    } catch (error) {
        console.error(`[Fetch] Error for ${facilityId} month ${month}:`, (error as Error).message);
        return null;
    }
};

// Process API results for a single campground into site availability + matches
// Adapted from processApiResults in fetchCampgroundData.jsx (lines 248-326)
export const processCampgroundResults = (
    apiResults: (RecGovMonthResult | null)[],
    allDates: string[],
    settings: ProcessSettings,
): SiteAvailabilityMap => {
    const siteAvailability: SiteAvailabilityMap = {};
    const minStay = Math.min(...(settings.stayLengths ?? [2]));
    const maxStay = Math.max(...(settings.stayLengths ?? [5]));

    // Accumulate available dates from all months' API responses
    for (const data of apiResults) {
        if (!data?.campsites) continue;

        for (const [siteId, siteData] of Object.entries(data.campsites)) {
            if (IGNORE_TYPES.includes(siteData.campsite_type)) continue;

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

    // For each site, find matching stay ranges
    for (const siteId in siteAvailability) {
        const site = siteAvailability[siteId];
        if (!site) continue;
        const uniqueDates = [...new Set(site.dates)].sort();
        const stayMatches: StayMatch[] = [];

        for (let length = 1; length <= 14; length++) {
            const allRangesForLength = findConsecutiveAvailableRanges(uniqueDates, length);

            for (const [from, to] of allRangesForLength) {
                const parts = from.split("-").map(Number);
                const y = parts[0] ?? 0;
                const m = parts[1] ?? 1;
                const d = parts[2] ?? 1;
                const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
                    weekday: "long",
                    timeZone: "UTC",
                });
                const isValidStartDay =
                    !settings.validStartDays?.length || settings.validStartDays.includes(startDay);
                const isValidStayLength = length >= minStay && length <= maxStay;

                if (isValidStayLength && isValidStartDay) {
                    stayMatches.push({ from, to, nights: length });
                }
            }
        }

        site.matches = filterNonOverlapping(stayMatches);
        // Remove raw dates from output — not needed for notifications
        delete (site as Partial<SiteAvailabilityRaw>).dates;
    }

    return siteAvailability;
};
