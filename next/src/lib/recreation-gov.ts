import { getEmptyGroupedSites, getLocalCurrentTime } from "@/lib/campground-utils";
import { getMockApiResponse } from "@/data/mock-recreation-api";
import type { Campground, ProcessedCampground, ExcludedStay, StayMatch } from "@/types/campground";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecreationGovMonthResponse {
    campsites: Record<
        string,
        {
            site: string;
            campsite_type?: string;
            availabilities: Record<string, string>;
        }
    >;
}

interface SiteFetchMapEntry {
    system: string;
    campground: Campground;
    allDates: string[];
    month: string;
}

interface FetchCampgroundsOptions {
    useMockData?: boolean;
}

interface FetchCampgroundsSettings {
    dates: {
        startDate?: string;
        endDate?: string;
        stayLengths?: number[];
        validStartDays?: string[];
    };
    ignoreTypes?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const DELAY_BETWEEN_REQUESTS_MS = 5;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const countMatches = (dataObj: Record<string, ProcessedCampground[]> | null | undefined): number => {
    return Object.values(dataObj || {})
        .flat()
        .reduce((total, campground) => {
            return (
                total +
                Object.values(campground?.siteAvailability || {}).reduce(
                    (sum, site) => sum + (site.matches?.length || 0),
                    0,
                )
            );
        }, 0);
};

const setCache = (key: string, data: Record<string, ProcessedCampground[]>): void => {
    if (typeof window === "undefined") return;

    const newMatchCount = countMatches(data);

    const existingStr = localStorage.getItem(key);
    if (existingStr) {
        try {
            const existing = JSON.parse(existingStr);
            const existingMatchCount = countMatches(existing.data);
            if (existingMatchCount > 0 && newMatchCount === 0) {
                console.log(
                    `[Cache] BLOCKED: Not overwriting cache with ${existingMatchCount} matches with empty data`,
                );
                return;
            }
        } catch {
            // ignore parse errors, proceed with save
        }
    }

    const entry = {
        data,
        timestamp: Date.now(),
    };
    console.log(`[Cache] Saving to cache: ${newMatchCount} total matches`);
    localStorage.setItem(key, JSON.stringify(entry));
};

export const clearCampgroundCache = (): number => {
    if (typeof window === "undefined") return 0;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("campgrounds-")) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    console.log(`[Cache] Cleared ${keysToRemove.length} cache entries`);
    return keysToRemove.length;
};

const getCache = (
    key: string,
    sites: Record<string, Campground[]>,
): Record<string, ProcessedCampground[]> | null => {
    if (typeof window === "undefined") return null;

    const entryStr = localStorage.getItem(key);
    if (!entryStr) {
        console.log("[Cache] No cache entry found for key:", key);
        return null;
    }

    try {
        const entry = JSON.parse(entryStr);
        const age = Date.now() - entry.timestamp;
        if (age > CACHE_DURATION_MS) {
            console.log(
                `[Cache] Cache expired (age: ${Math.round(age / 1000)}s, max: ${CACHE_DURATION_MS / 1000}s)`,
            );
            localStorage.removeItem(key);
            return null;
        }

        for (const system in sites) {
            const expectedIds = new Set((sites[system] ?? []).map((c) => c.id));
            const cachedIds = new Set((entry.data?.[system] || []).map((c: ProcessedCampground) => c.id));
            for (const id of expectedIds) {
                if (!cachedIds.has(id)) {
                    console.log(`[Cache] Cache miss - missing campground ID: ${id}`);
                    return null;
                }
            }
        }

        console.log(`[Cache] Cache hit! Age: ${Math.round(age / 1000)}s`);

        // Merge current showOrHide settings from siteConfig into cached data
        for (const system in entry.data) {
            if (sites[system]) {
                (entry.data[system] as ProcessedCampground[]).forEach((cachedCampground) => {
                    const currentConfig = (sites[system] ?? []).find((c) => c.id === cachedCampground.id);
                    if (currentConfig?.showOrHide) {
                        cachedCampground.showOrHide = { ...currentConfig.showOrHide };
                    }
                });
            }
        }

        // Log what's in the cached data
        for (const system in entry.data) {
            (entry.data[system] as ProcessedCampground[]).forEach((campground) => {
                const matchCount = Object.values(campground.siteAvailability || {}).reduce(
                    (sum, site) => sum + (site.matches?.length || 0),
                    0,
                );
                console.log(`[Cache] Cached ${campground.name || campground.id}: ${matchCount} matches`);
            });
        }
        return entry.data as Record<string, ProcessedCampground[]>;
    } catch (e) {
        console.log("[Cache] Error parsing cache:", e);
        localStorage.removeItem(key);
        return null;
    }
};

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function fetchData(facilityId: string, month: string): Promise<RecreationGovMonthResponse | null> {
    const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${month}-01T00%3A00%3A00.000Z`;
    try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) {
            console.error(`recreation.gov ${facilityId} returned ${r.status}`);
            return null;
        }
        return (await r.json()) as RecreationGovMonthResponse;
    } catch (e) {
        console.error("recreation.gov fetch error:", e);
        return null;
    }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export const removeParentFromObject = (data: Record<string, unknown[]>): unknown[] => {
    return Object.values(data).flat();
};

const buildCacheKey = (sites: Record<string, Campground[]>): string => {
    const uniqueKeyFragments: string[] = [];

    for (const system in sites) {
        const campgroundData = sites[system];
        if (!Array.isArray(campgroundData)) continue;

        for (const campground of campgroundData) {
            const start = campground.dates?.startDate || "";
            const end = campground.dates?.endDate || "";
            uniqueKeyFragments.push(`${campground.id}:${start}-${end}`);
        }
    }

    return `campgrounds-${uniqueKeyFragments.sort().join("|")}`;
};

export const getSiteFetchMap = (
    sites: Record<string, Campground[]>,
    settings: FetchCampgroundsSettings,
): SiteFetchMapEntry[] => {
    const siteFetchMap: SiteFetchMapEntry[] = [];

    for (const system in sites) {
        const campgroundData = sites[system];
        if (!Array.isArray(campgroundData)) continue;

        for (const campground of campgroundData) {
            if (campground.enabled === false) continue;
            const startDate = campground.dates?.startDate || settings.dates.startDate;
            const endDate = campground.dates?.endDate || settings.dates.endDate;
            const allDates = getAllDatesInRange(startDate!, endDate!);
            const allMonths = [...new Set(allDates.map((date) => date.slice(0, 7)))];

            for (const month of allMonths) {
                siteFetchMap.push({ system, campground, allDates, month });
            }
        }
    }

    return siteFetchMap;
};

export const makeAllRequests = async (
    siteFetchMap: SiteFetchMapEntry[],
    onProgress?: (current: number, total: number) => void,
): Promise<Array<RecreationGovMonthResponse | null>> => {
    const allResults: Array<RecreationGovMonthResponse | null> = [];
    const total = siteFetchMap.length;
    for (const entry of siteFetchMap) {
        const { campground, month } = entry;
        const result = await fetchData(campground.id, month);
        allResults.push(result);
        if (typeof onProgress === "function") {
            onProgress(allResults.length, total);
        }
        await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
    return allResults;
};

const makeMockRequests = async (
    siteFetchMap: SiteFetchMapEntry[],
    onProgress?: (current: number, total: number) => void,
): Promise<Array<RecreationGovMonthResponse | null>> => {
    const total = siteFetchMap.length;
    const allResults: Array<RecreationGovMonthResponse | null> = [];
    for (const entry of siteFetchMap) {
        const { campground, month } = entry;
        const result = getMockApiResponse(campground.id, month);
        allResults.push(result);
        if (typeof onProgress === "function") {
            onProgress(allResults.length, total);
        }
    }
    return allResults;
};

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

const processApiResults = (
    allResults: Array<RecreationGovMonthResponse | null>,
    siteFetchMap: SiteFetchMapEntry[],
    settings: FetchCampgroundsSettings,
): Record<string, ProcessedCampground[]> => {
    const results: Record<string, ProcessedCampground[]> = {};

    // First, ensure all configured campgrounds are in results (even without data)
    siteFetchMap.forEach(({ system, campground }) => {
        if (!results[system]) results[system] = [];
        let campgroundEntry = results[system].find((c) => c.id === campground.id);
        if (!campgroundEntry) {
            const sitesGroupedByFavorites = getEmptyGroupedSites();
            campgroundEntry = {
                ...campground,
                siteAvailability: {},
                sitesGroupedByFavorites,
                excludedMatches: { byStayLength: 0, byStartDay: 0, sites: {} },
            };
            results[system].push(campgroundEntry);
        }
    });

    // Then process API results for availability data
    allResults.forEach((data, index) => {
        const mapEntry = siteFetchMap[index];
        if (!mapEntry) return;
        const { system, campground, allDates } = mapEntry;
        console.log(
            `[API Response] Campground ${campground.id}:`,
            data ? `${Object.keys(data.campsites || {}).length} campsites returned` : "No data",
        );
        if (data && data.campsites) {
            const campgroundEntry = (results[system] ?? []).find((c) => c.id === campground.id)!;

            for (const [siteId, siteData] of Object.entries(data.campsites)) {
                if (settings?.ignoreTypes?.includes(siteData.campsite_type ?? "")) {
                    break;
                }
                if (!campgroundEntry.siteAvailability[siteId]) {
                    campgroundEntry.siteAvailability[siteId] = {
                        siteId,
                        siteName: siteData.site,
                        dates: [],
                        matches: [],
                        excludedMatches: [],
                    };
                }
                const validDates = Object.entries(siteData.availabilities)
                    .filter(([, status]) => status === "Available")
                    .map(([date]) => date.split("T")[0] ?? "")
                    .filter((date) => allDates.includes(date));

                if (validDates.length > 0) {
                    console.log(
                        `  [Available] Site ${siteData.site} (${siteId}): ${validDates.length} available dates`,
                    );
                }
                campgroundEntry.siteAvailability[siteId]?.dates.push(...validDates);
            }

            for (const siteId in campgroundEntry.siteAvailability) {
                const site = campgroundEntry.siteAvailability[siteId];
                if (!site) continue;
                const uniqueDates = [...new Set(site.dates)].sort();
                const stayMatches: StayMatch[] = [];
                const excludedRanges: ExcludedStay[] = [];

                const effectiveStayLengths = campground.stayLengths ?? settings.dates.stayLengths;
                const minStay = Math.min(...(effectiveStayLengths || [2]));
                const maxStay = Math.max(...(effectiveStayLengths || [5]));

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
                        const effectiveStartDays = campground.validStartDays ?? settings.dates.validStartDays;
                        const isValidStartDay =
                            !effectiveStartDays?.length || effectiveStartDays.includes(startDay);
                        const isValidStayLength = length >= minStay && length <= maxStay;

                        if (isValidStayLength && isValidStartDay) {
                            stayMatches.push({ from, to, nights: length });
                        } else {
                            const sName = site.siteName;
                            if (!campgroundEntry.excludedMatches!.sites[sName]) {
                                campgroundEntry.excludedMatches!.sites[sName] = {
                                    siteId,
                                    byStayLength: 0,
                                    byStartDay: 0,
                                };
                            }
                            const reason = !isValidStayLength ? "stayLength" : "startDay";
                            excludedRanges.push({ from, to, nights: length, excluded: true, reason });
                            if (!isValidStayLength) {
                                campgroundEntry.excludedMatches!.byStayLength++;
                                campgroundEntry.excludedMatches!.sites[sName].byStayLength++;
                            } else {
                                campgroundEntry.excludedMatches!.byStartDay++;
                                campgroundEntry.excludedMatches!.sites[sName].byStartDay++;
                            }
                        }
                    }
                }

                const sorted = stayMatches.sort((a, b) => b.nights - a.nights);
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

                const sortedExcluded = excludedRanges.sort((a, b) => b.nights - a.nights);
                const filteredExcluded: ExcludedStay[] = [];
                for (const match of sortedExcluded) {
                    const matchStart = new Date(match.from);
                    const matchEnd = new Date(match.to);
                    const isContained = filteredExcluded.some(({ from, to }) => {
                        const existingStart = new Date(from);
                        const existingEnd = new Date(to);
                        return matchStart >= existingStart && matchEnd <= existingEnd;
                    });
                    if (!isContained) filteredExcluded.push(match);
                }

                site.matches = filtered;
                site.excludedMatches = filteredExcluded;
                if (filtered.length > 0) {
                    console.log(
                        `  [Matches] Site ${site.siteName}: ${filtered.length} matching stays`,
                        filtered,
                    );
                }
            }
        }
    });

    // Summary log
    for (const system in results) {
        (results[system] ?? []).forEach((campground) => {
            const totalMatches = Object.values(campground.siteAvailability).reduce(
                (sum, site) => sum + (site.matches?.length || 0),
                0,
            );
            console.log(`[Summary] ${campground.name || campground.id}: ${totalMatches} total matches`);
        });
    }

    return results;
};

const calculateExcludedMatches = (
    data: Record<string, ProcessedCampground[]>,
    settings: FetchCampgroundsSettings,
): Record<string, ProcessedCampground[]> => {
    for (const system in data) {
        (data[system] || []).forEach((campground) => {
            const effectiveStayLengths = campground.stayLengths ?? settings.dates.stayLengths;
            const minStay = Math.min(...(effectiveStayLengths || [2]));
            const maxStay = Math.max(...(effectiveStayLengths || [5]));
            campground.excludedMatches = { byStayLength: 0, byStartDay: 0, sites: {} };

            for (const siteId in campground.siteAvailability) {
                const site = campground.siteAvailability[siteId];
                if (!site) continue;
                const uniqueDates = [...new Set(site.dates || [])].sort();
                const excludedRanges: ExcludedStay[] = [];

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
                        const effectiveStartDays = campground.validStartDays ?? settings.dates.validStartDays;
                        const isValidStartDay =
                            !effectiveStartDays?.length || effectiveStartDays.includes(startDay);
                        const isValidStayLength = length >= minStay && length <= maxStay;

                        const sName = site.siteName;
                        if (!isValidStayLength || !isValidStartDay) {
                            if (!campground.excludedMatches!.sites[sName]) {
                                campground.excludedMatches!.sites[sName] = {
                                    siteId,
                                    byStayLength: 0,
                                    byStartDay: 0,
                                };
                            }
                            const reason = !isValidStayLength ? "stayLength" : "startDay";
                            excludedRanges.push({ from, to, nights: length, excluded: true, reason });
                            if (!isValidStayLength) {
                                campground.excludedMatches!.byStayLength++;
                                campground.excludedMatches!.sites[sName].byStayLength++;
                            } else {
                                campground.excludedMatches!.byStartDay++;
                                campground.excludedMatches!.sites[sName].byStartDay++;
                            }
                        }
                    }
                }

                const sortedExcluded = excludedRanges.sort((a, b) => b.nights - a.nights);
                const filteredExcluded: ExcludedStay[] = [];
                for (const match of sortedExcluded) {
                    const matchStart = new Date(match.from);
                    const matchEnd = new Date(match.to);
                    const isContained = filteredExcluded.some(({ from, to }) => {
                        const existingStart = new Date(from);
                        const existingEnd = new Date(to);
                        return matchStart >= existingStart && matchEnd <= existingEnd;
                    });
                    if (!isContained) filteredExcluded.push(match);
                }
                site.excludedMatches = filteredExcluded;
            }
        });
    }
    return data;
};

const reorderResultsByConfig = (
    results: Record<string, ProcessedCampground[]>,
    siteConfig: Record<string, Campground[]>,
): Record<string, ProcessedCampground[]> => {
    const reordered: Record<string, ProcessedCampground[]> = {};
    for (const system in siteConfig) {
        const systemResults = results[system];
        if (!systemResults) continue;
        const configOrder = (siteConfig[system] ?? []).filter((c) => c.enabled !== false).map((c) => c.id);
        reordered[system] = configOrder
            .map((id) => systemResults.find((c) => c.id === id))
            .filter((c): c is ProcessedCampground => Boolean(c));
    }
    return reordered;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const fetchCampgrounds = async (
    sites: Record<string, Campground[]>,
    settings: FetchCampgroundsSettings,
    onProgress?: (current: number, total: number) => void,
    onlyReturnNumOfCalls = false,
    options: FetchCampgroundsOptions = {},
): Promise<Record<string, ProcessedCampground[]> | number | undefined> => {
    const { useMockData = false } = options;
    if (!sites) {
        console.error("Error with Sites JSON Provided");
        return;
    }

    const cacheKey = `${buildCacheKey(sites)}${useMockData ? "-mock" : ""}`;
    const cached = useMockData ? null : getCache(cacheKey, sites);
    if (cached && !onlyReturnNumOfCalls) {
        console.info(`Using Cached Data at ${getLocalCurrentTime()}`);
        calculateExcludedMatches(cached, settings);
        return reorderResultsByConfig(cached, sites);
    }

    const siteFetchMap = getSiteFetchMap(sites, settings);

    if (onlyReturnNumOfCalls) {
        return siteFetchMap.length;
    }

    let allResults: Array<RecreationGovMonthResponse | null>;
    if (useMockData) {
        console.info(`Using mock Recreation.gov data at ${getLocalCurrentTime()}`);
        allResults = await makeMockRequests(siteFetchMap, onProgress);
    } else {
        console.info(`Making ${siteFetchMap.length} Calls For Data at ${getLocalCurrentTime()}`);
        allResults = await makeAllRequests(siteFetchMap, onProgress);
    }

    const results = processApiResults(allResults, siteFetchMap, settings);
    const orderedResults = reorderResultsByConfig(results, sites);

    if (!useMockData) {
        setCache(cacheKey, orderedResults);
    }
    return orderedResults;
};

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

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

export const filterLongestNonOverlappingStays = (
    entries: Array<{ siteId: string; siteName: string; matches: StayMatch[] }>,
): Record<string, { siteId: string; matches: StayMatch[] }> => {
    const grouped: Record<string, { siteId: string; matches: StayMatch[] }> = {};
    for (const { siteId, siteName, matches } of entries) {
        if (!grouped[siteName]) grouped[siteName] = { siteId, matches: [] };
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
        grouped[siteName].matches = filtered;
    }
    return grouped;
};
