// Port of core fetch + match detection logic from src/calls/fetchCampgroundData.jsx
// Uses native fetch (Node 18+) instead of axios. No dependencies required.

const DELAY_BETWEEN_REQUESTS_MS = 50;
const DELAY_BETWEEN_CAMPGROUNDS_MS = 2000;
const IGNORE_TYPES = ['GROUP SHELTER NONELECTRIC', 'WALK TO', 'DAY USE'];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Copied from src/calls/fetchCampgroundData.jsx (line 469)
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

// Copied from src/calls/fetchCampgroundData.jsx (line 480)
export const findConsecutiveAvailableRanges = (dates, length) => {
    const ranges = [];
    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let i = 0; i <= timestamps.length - length; ) {
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

// Remove matches that are fully contained within a longer match
const filterNonOverlapping = (matches) => {
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
    return filtered;
};

// Fetch a single month of availability data for a campground
const fetchMonth = async (facilityId, month) => {
    const formattedMonth = `${month}-01T00%3A00%3A00.000Z`;
    const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${formattedMonth}`;
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            console.error(`[Fetch] HTTP ${response.status} for ${facilityId} month ${month}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`[Fetch] Error for ${facilityId} month ${month}:`, error.message);
        return null;
    }
};

// Process API results for a single campground into site availability + matches
// Adapted from processApiResults in fetchCampgroundData.jsx (lines 248-326)
const processCampgroundResults = (apiResults, allDates, settings) => {
    const siteAvailability = {};
    const minStay = Math.min(...(settings.stayLengths || [2]));
    const maxStay = Math.max(...(settings.stayLengths || [5]));

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
                .filter(([, status]) => status === 'Available')
                .map(([date]) => date.split('T')[0])
                .filter((date) => allDates.includes(date));

            siteAvailability[siteId].dates.push(...validDates);
        }
    }

    // For each site, find matching stay ranges
    for (const siteId in siteAvailability) {
        const site = siteAvailability[siteId];
        const uniqueDates = [...new Set(site.dates)].sort();
        const stayMatches = [];

        for (let length = 1; length <= 14; length++) {
            const allRangesForLength = findConsecutiveAvailableRanges(uniqueDates, length);

            for (const [from, to] of allRangesForLength) {
                const [y, m, d] = from.split('-').map(Number);
                const startDay = new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
                    weekday: 'long',
                    timeZone: 'UTC',
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
        delete site.dates;
    }

    return siteAvailability;
};

// Fetch and process all availability for a single campground
export const fetchCampground = async (campground, settings) => {
    const startDate = campground.dates?.startDate || settings.startDate;
    const endDate = campground.dates?.endDate || settings.endDate;
    const allDates = getAllDatesInRange(startDate, endDate);
    const allMonths = [...new Set(allDates.map((date) => date.slice(0, 7)))];

    console.log(`[Check] ${campground.name} (${campground.id}): ${allMonths.length} months to fetch`);

    const apiResults = [];
    for (const month of allMonths) {
        const result = await fetchMonth(campground.id, month);
        apiResults.push(result);
        await delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    const siteAvailability = processCampgroundResults(apiResults, allDates, settings);
    const totalMatches = Object.values(siteAvailability).reduce(
        (sum, site) => sum + (site.matches?.length || 0),
        0
    );
    console.log(`[Check] ${campground.name}: ${totalMatches} total matches`);

    return {
        campgroundId: campground.id,
        campgroundName: campground.name,
        campgroundArea: campground.area,
        sites: siteAvailability,
    };
};

// Fetch all campgrounds sequentially with delays between them
export const fetchAllCampgrounds = async (campgrounds, settings) => {
    const results = [];
    for (let i = 0; i < campgrounds.length; i++) {
        const result = await fetchCampground(campgrounds[i], settings);
        results.push(result);
        if (i < campgrounds.length - 1) {
            await delay(DELAY_BETWEEN_CAMPGROUNDS_MS);
        }
    }
    return results;
};
