import axios from 'axios';
import { getEmptyGroupedSites, getLocalCurrentTime } from '../utils/utils';
import { getMockApiResponse } from '../json/mockRecreationApi';

export const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const DELAY_BETWEEN_REQUESTS_MS = 5; // Delay in ms between each API call (increased to avoid rate limiting)

const countMatches = (dataObj) => {
    return Object.values(dataObj || {}).flat().reduce((total, campground) => {
        return total + Object.values(campground?.siteAvailability || {}).reduce((sum, site) => sum + (site.matches?.length || 0), 0);
    }, 0);
};

const setCache = (key, data) => {
    // Calculate total matches in new data
    const newMatchCount = countMatches(data);

    // Check if existing cache has more matches (don't overwrite good data with empty data)
    const existingStr = localStorage.getItem(key);
    if (existingStr) {
        try {
            const existing = JSON.parse(existingStr);
            const existingMatchCount = countMatches(existing.data);
            if (existingMatchCount > 0 && newMatchCount === 0) {
                console.log(`[Cache] BLOCKED: Not overwriting cache with ${existingMatchCount} matches with empty data`);
                return;
            }
        } catch {
            // ignore parse errors, proceed with save
        }
    }

    const entry = {
        data,
        timestamp: Date.now()
    };
    console.log(`[Cache] Saving to cache: ${newMatchCount} total matches`);
    localStorage.setItem(key, JSON.stringify(entry));
};

export const clearCampgroundCache = () => {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('campgrounds-')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[Cache] Cleared ${keysToRemove.length} cache entries`);
    return keysToRemove.length;
};

const getCache = (key, sites) => {
    const entryStr = localStorage.getItem(key);
    if (!entryStr) {
        console.log('[Cache] No cache entry found for key:', key);
        return null;
    }

    try {
        const entry = JSON.parse(entryStr);
        const age = Date.now() - entry.timestamp;
        if (age > CACHE_DURATION_MS) {
            console.log(`[Cache] Cache expired (age: ${Math.round(age / 1000)}s, max: ${CACHE_DURATION_MS / 1000}s)`);
            localStorage.removeItem(key);
            return null;
        }

        for (let system in sites) {
            const expectedIds = new Set(sites[system].map(c => c.id));
            const cachedIds = new Set((entry.data?.[system] || []).map(c => c.id));
            for (let id of expectedIds) {
                if (!cachedIds.has(id)) {
                    console.log(`[Cache] Cache miss - missing campground ID: ${id}`);
                    return null;
                }
            }
        }

        console.log(`[Cache] Cache hit! Age: ${Math.round(age / 1000)}s`);

        // Merge current showOrHide settings from siteConfig into cached data
        // This ensures user's setting changes are reflected even when using cached data
        for (const system in entry.data) {
            if (sites[system]) {
                entry.data[system].forEach(cachedCampground => {
                    const currentConfig = sites[system].find(c => c.id === cachedCampground.id);
                    if (currentConfig?.showOrHide) {
                        cachedCampground.showOrHide = { ...currentConfig.showOrHide };
                    }
                });
            }
        }

        // Log what's in the cached data
        for (const system in entry.data) {
            entry.data[system].forEach(campground => {
                const matchCount = Object.values(campground.siteAvailability || {}).reduce((sum, site) => sum + (site.matches?.length || 0), 0);
                console.log(`[Cache] Cached ${campground.name || campground.id}: ${matchCount} matches`);
            });
        }
        return entry.data;
    } catch (e) {
        console.log('[Cache] Error parsing cache:', e);
        localStorage.removeItem(key);
        return null;
    }
};

const fetchData = async (facilityId, month) => {
    const formattedMonth = `${month}-01T00%3A00%3A00.000Z`;
    const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${formattedMonth}`;
    const headers = {
        'Accept': 'application/json',
    };
    try {
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (error) {
        console.error('Axios error:', error);
        return null;
    }
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const removeParentFromObject = (data) => {
    return Object.values(data).flat();
};

const buildCacheKey = (sites) => {
    const uniqueKeyFragments = [];

    for (let system in sites) {
        const campgroundData = sites[system];
        if (!Array.isArray(campgroundData)) continue;

        for (let campground of campgroundData) {
            const start = campground.dates?.startDate || '';
            const end = campground.dates?.endDate || '';
            uniqueKeyFragments.push(`${campground.id}:${start}-${end}`);
        }
    }

    return `campgrounds-${uniqueKeyFragments.sort().join('|')}`;
};

export const getSiteFetchMap = (sites, settings) => {
    const siteFetchMap = [];

    for (let system in sites) {
        const campgroundData = sites[system];
        if (!Array.isArray(campgroundData)) continue;

        for (let campground of campgroundData) {
            const startDate = campground.dates?.startDate || settings.dates.startDate;
            const endDate = campground.dates?.endDate || settings.dates.endDate;
            const allDates = getAllDatesInRange(startDate, endDate);
            const allMonths = [...new Set(allDates.map(date => date.slice(0, 7)))];

            for (let month of allMonths) {
                siteFetchMap.push({ system, campground, allDates, month });
            }
        }
    }

    return siteFetchMap;
};

export const makeAllRequests = async (siteFetchMap, onProgress) => {
    const allResults = [];
    const total = siteFetchMap.length;
    for (let i = 0; i < siteFetchMap.length; i++) {
        const { campground, month } = siteFetchMap[i];
        const result = await fetchData(campground.id, month);
        // console.log('result: ', result);
        allResults.push(result);
        if (typeof onProgress === 'function') {
            onProgress(i + 1, total); // 1-based current call
        }
        await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
    return allResults;
};

const makeMockRequests = async (siteFetchMap, onProgress) => {
    const total = siteFetchMap.length;
    const allResults = [];
    for (let i = 0; i < siteFetchMap.length; i++) {
        const { campground, month } = siteFetchMap[i];
        const result = getMockApiResponse(campground.id, month);
        allResults.push(result);
        if (typeof onProgress === 'function') {
            onProgress(i + 1, total);
        }
    }
    return allResults;
};

const processApiResults = (allResults, siteFetchMap, settings) => {
    const results = {};

    // First, ensure all configured campgrounds are in results (even without data)
    siteFetchMap.forEach(({ system, campground }) => {
        if (!results[system]) results[system] = [];
        let campgroundEntry = results[system].find(c => c.id === campground.id);
        if (!campgroundEntry) {
            const sitesGroupedByFavorites = getEmptyGroupedSites();
            campgroundEntry = {
                ...campground,
                siteAvailability: {},
                sitesGroupedByFavorites: sitesGroupedByFavorites,
                excludedMatches: { byStayLength: 0, byStartDay: 0, sites: {} },
            };
            results[system].push(campgroundEntry);
        }
    });

    // Then process API results for availability data
    allResults.forEach((data, index) => {
        const { system, campground, allDates } = siteFetchMap[index];
        console.log(`[API Response] Campground ${campground.id}:`, data ? `${Object.keys(data.campsites || {}).length} campsites returned` : 'No data');
        if (data && data.campsites) {
            let campgroundEntry = results[system].find(c => c.id === campground.id);

            for (const [siteId, siteData] of Object.entries(data.campsites)) {
                if (settings?.ignoreTypes?.includes(siteData.campsite_type)) {
                    break;
                }
                if (!campgroundEntry.siteAvailability[siteId]) {
                    campgroundEntry.siteAvailability[siteId] = {
                        siteId,
                        siteName: siteData.site,
                        dates: []
                    };
                }
                const validDates = Object.entries(siteData.availabilities)
                    .filter(([_, status]) => status === 'Available')
                    .map(([date]) => date.split('T')[0])
                    .filter(date => allDates.includes(date));

                if (validDates.length > 0) {
                    console.log(`  [Available] Site ${siteData.site} (${siteId}): ${validDates.length} available dates`);
                }
                campgroundEntry.siteAvailability[siteId].dates.push(...validDates);
            }
            for (const siteId in campgroundEntry.siteAvailability) {
                const site = campgroundEntry.siteAvailability[siteId];
                const uniqueDates = [...new Set(site.dates)].sort();
                const stayMatches = [];
                const excludedRanges = [];

                // Get min/max stay lengths to check for excluded matches
                const minStay = Math.min(...(settings.dates.stayLengths || [2]));
                const maxStay = Math.max(...(settings.dates.stayLengths || [5]));

                // Find all possible ranges (1-14 nights) to count exclusions
                for (let length = 1; length <= 14; length++) {
                    const allRangesForLength = findConsecutiveAvailableRanges(uniqueDates, length);

                    for (const [from, to] of allRangesForLength) {
                        const [y, m, d] = from.split('-').map(Number);
                        const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
                            weekday: 'long',
                            timeZone: 'UTC'
                        });
                        const isValidStartDay = !settings.dates.validStartDays?.length || settings.dates.validStartDays.includes(startDay);
                        const isValidStayLength = length >= minStay && length <= maxStay;

                        if (isValidStayLength && isValidStartDay) {
                            // This match passes all filters
                            stayMatches.push({ from, to, nights: length });
                        } else {
                            // Track exclusions
                            const sName = site.siteName;
                            if (!campgroundEntry.excludedMatches.sites[sName]) {
                                campgroundEntry.excludedMatches.sites[sName] = { siteId, byStayLength: 0, byStartDay: 0 };
                            }
                            const reason = !isValidStayLength ? 'stayLength' : 'startDay';
                            excludedRanges.push({ from, to, nights: length, excluded: true, reason });
                            if (!isValidStayLength) {
                                campgroundEntry.excludedMatches.byStayLength++;
                                campgroundEntry.excludedMatches.sites[sName].byStayLength++;
                            } else {
                                campgroundEntry.excludedMatches.byStartDay++;
                                campgroundEntry.excludedMatches.sites[sName].byStartDay++;
                            }
                        }
                    }
                }

                const sorted = stayMatches.sort((a, b) => b.nights - a.nights);
                const filtered = [];

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

                // Apply same non-overlapping filter to excluded ranges
                const sortedExcluded = excludedRanges.sort((a, b) => b.nights - a.nights);
                const filteredExcluded = [];
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
                    console.log(`  [Matches] Site ${site.siteName}: ${filtered.length} matching stays`, filtered);
                }
            }
        }
    });

    // Summary log
    for (const system in results) {
        results[system].forEach(campground => {
            const totalMatches = Object.values(campground.siteAvailability).reduce((sum, site) => sum + (site.matches?.length || 0), 0);
            console.log(`[Summary] ${campground.name || campground.id}: ${totalMatches} total matches`);
        });
    }

    return results;
};

// Calculate excluded matches based on current settings
// This runs on both cached and fresh data so exclusion counts stay accurate when settings change
const calculateExcludedMatches = (data, settings) => {
    const minStay = Math.min(...(settings.dates.stayLengths || [2]));
    const maxStay = Math.max(...(settings.dates.stayLengths || [5]));

    for (const system in data) {
        (data[system] || []).forEach(campground => {
            campground.excludedMatches = { byStayLength: 0, byStartDay: 0, sites: {} };

            for (const siteId in campground.siteAvailability) {
                const site = campground.siteAvailability[siteId];
                const uniqueDates = [...new Set(site.dates || [])].sort();
                const excludedRanges = [];

                // Check all possible ranges (1-14 nights) against current filters
                for (let length = 1; length <= 14; length++) {
                    const allRangesForLength = findConsecutiveAvailableRanges(uniqueDates, length);

                    for (const [from, to] of allRangesForLength) {
                        const [y, m, d] = from.split('-').map(Number);
                        const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
                            weekday: 'long',
                            timeZone: 'UTC'
                        });
                        const isValidStartDay = !settings.dates.validStartDays?.length || settings.dates.validStartDays.includes(startDay);
                        const isValidStayLength = length >= minStay && length <= maxStay;

                        const sName = site.siteName;
                        if (!isValidStayLength || !isValidStartDay) {
                            if (!campground.excludedMatches.sites[sName]) {
                                campground.excludedMatches.sites[sName] = { siteId, byStayLength: 0, byStartDay: 0 };
                            }
                            const reason = !isValidStayLength ? 'stayLength' : 'startDay';
                            excludedRanges.push({ from, to, nights: length, excluded: true, reason });
                            if (!isValidStayLength) {
                                campground.excludedMatches.byStayLength++;
                                campground.excludedMatches.sites[sName].byStayLength++;
                            } else {
                                campground.excludedMatches.byStartDay++;
                                campground.excludedMatches.sites[sName].byStartDay++;
                            }
                        }
                    }
                }

                // Apply non-overlapping filter to excluded ranges
                const sortedExcluded = excludedRanges.sort((a, b) => b.nights - a.nights);
                const filteredExcluded = [];
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

// Reorder results to match the order specified in siteConfig
const reorderResultsByConfig = (results, siteConfig) => {
    const reordered = {};
    for (const system in siteConfig) {
        if (!results[system]) continue;
        const configOrder = siteConfig[system].map(c => c.id);
        reordered[system] = configOrder
            .map(id => results[system].find(c => c.id === id))
            .filter(Boolean);
    }
    return reordered;
};

export const fetchCampgrounds = async (
    sites,
    settings,
    onProgress,
    onlyReturnNumOfCalls = false,
    options = {}
) => {
    const { useMockData = false } = options;
    if (!sites) {
        console.error("Error with Sites JSON Provided");
        return;
    }

    const cacheKey = `${buildCacheKey(sites)}${useMockData ? '-mock' : ''}`;
    const cached = useMockData ? null : getCache(cacheKey, sites);
    if (cached && !onlyReturnNumOfCalls) {
        console.info(`Using Cached Data at ${getLocalCurrentTime()}`);
        // Calculate excluded matches based on current settings (may have changed since cache was created)
        calculateExcludedMatches(cached, settings);
        // Reorder to match current siteConfig order
        return reorderResultsByConfig(cached, sites);
    }

    const siteFetchMap = getSiteFetchMap(sites, settings);

    if (onlyReturnNumOfCalls) {
        return siteFetchMap.length;
    }

    let allResults;
    if (useMockData) {
        console.info(`Using mock Recreation.gov data at ${getLocalCurrentTime()}`);
        allResults = await makeMockRequests(siteFetchMap, onProgress);
    } else {
        console.info(`Making ${siteFetchMap.length} Calls For Data at ${getLocalCurrentTime()}`);
        allResults = await makeAllRequests(siteFetchMap, onProgress);
    }

    const results = processApiResults(allResults, siteFetchMap, settings);

    // Reorder to match siteConfig order
    const orderedResults = reorderResultsByConfig(results, sites);

    if (!useMockData) {
        setCache(cacheKey, orderedResults);
    }
    return orderedResults;
};

export const getAllDatesInRange = (start, end) => {
    const result = [];
    const current = new Date(start);
    const final = new Date(end);
    while (current <= final) {
        result.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    return result;
};

export const findConsecutiveAvailableRanges = (dates, length) => {
    const ranges = [];
    const timestamps = dates.map(d => new Date(d).getTime());
    for (let i = 0; i <= timestamps.length - length;) {
        let isConsecutive = true;
        for (let j = 1; j < length; j++) {
            const expected = timestamps[i] + j * 86400000;
            if (timestamps[i + j] !== expected) {
                isConsecutive = false;
                break;
            }
        }
        if (isConsecutive) {
            const from = new Date(timestamps[i]).toISOString().split('T')[0];
            const toDate = new Date(timestamps[i + length - 1]);
            toDate.setDate(toDate.getDate() + 1);
            const to = toDate.toISOString().split('T')[0];
            ranges.push([from, to]);
            i += length;
        } else {
            i++;
        }
    }
    return ranges;
};

export const filterLongestNonOverlappingStays = entries => {
    const grouped = {};
    for (const { siteId, siteName, matches } of entries) {
        if (!grouped[siteName]) grouped[siteName] = { siteId, matches: [] };
        const sorted = [...matches].sort((a, b) => b.nights - a.nights);
        const filtered = [];
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
