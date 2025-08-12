import axios from 'axios';
import { getEmptyGroupedSites } from '../utils/utils';

export const CACHE_DURATION_MS = 4 * 60 * 1000; // 4 minutes
const DELAY_BETWEEN_REQUESTS_MS = 1; // Delay in ms between each API call

const setCache = (key, data) => {
    const entry = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(entry));
};

const getCache = (key, sites) => {
    const entryStr = localStorage.getItem(key);
    if (!entryStr) return null;

    try {
        const entry = JSON.parse(entryStr);
        if (Date.now() - entry.timestamp > CACHE_DURATION_MS) {
            localStorage.removeItem(key);
            return null;
        }

        for (let system in sites) {
            const expectedIds = new Set(sites[system].map(c => c.id));
            const cachedIds = new Set((entry.data?.[system] || []).map(c => c.id));
            for (let id of expectedIds) {
                if (!cachedIds.has(id)) return null;
            }
        }

        return entry.data;
    } catch {
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
        allResults.push(result);
        if (typeof onProgress === 'function') {
            onProgress(i + 1, total); // 1-based current call
        }
        await delay(DELAY_BETWEEN_REQUESTS_MS);
    }
    return allResults;
};

const processApiResults = (allResults, siteFetchMap, settings) => {
    const results = {};

    allResults.forEach((data, index) => {
        const { system, campground, allDates } = siteFetchMap[index];
        if (!data || !data.campsites) return;

        if (!results[system]) results[system] = [];

        let campgroundEntry = results[system].find(c => c.id === campground.id);
        if (!campgroundEntry) {
            const sitesGroupedByFavorites = getEmptyGroupedSites();
            campgroundEntry = { ...campground, siteAvailability: {}, sitesGroupedByFavorites: sitesGroupedByFavorites };
            results[system].push(campgroundEntry);
        }
        for (const [siteId, siteData] of Object.entries(data.campsites)) {
            if (settings?.ignoreTypes?.includes(siteData.campsite_type)) {
                return;
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

            campgroundEntry.siteAvailability[siteId].dates.push(...validDates);
        }

        for (const siteId in campgroundEntry.siteAvailability) {
            const site = campgroundEntry.siteAvailability[siteId];
            const uniqueDates = [...new Set(site.dates)].sort();
            const stayMatches = [];

            for (const stayLength of settings.dates.stayLengths || []) {
                const matches = findConsecutiveAvailableRanges(uniqueDates, stayLength)
                    .filter(([from]) => {
                        if (!settings.dates.validStartDays?.length) return true;
                        const [y, m, d] = from.split('-').map(Number);
                        const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
                            weekday: 'long',
                            timeZone: 'UTC'
                        });
                        return settings.dates.validStartDays.includes(startDay);
                    })
                    .map(([from, to]) => ({ from, to, nights: stayLength }));

                stayMatches.push(...matches);
            }

            const sorted = stayMatches.sort((a, b) => (new Date(b.nights) - new Date(a.nights)));
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

            site.matches = filtered;
        }
    });

    return results;
};

export const fetchCampgrounds = async (sites, settings, onProgress, onlyReturnNumOfCalls = false) => {
    if (!sites) {
        console.error("Error with Sites JSON Provided");
        return;
    }

    const cacheKey = buildCacheKey(sites);
    const cached = getCache(cacheKey, sites);
    if (cached && !onlyReturnNumOfCalls) {
        return cached;
    }

    const siteFetchMap = getSiteFetchMap(sites, settings);

    if (onlyReturnNumOfCalls) {
        return siteFetchMap.length;
    }

    const allResults = await makeAllRequests(siteFetchMap, onProgress);

    const results = processApiResults(allResults, siteFetchMap, settings);

    setCache(cacheKey, results);
    return results;
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
        const sorted = [...matches].sort((a, b) => new Date(b.nights) - new Date(a.nights));
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