import { siteGroups } from '../constants/settings';

export const checkForAvailability = (data) => {
    if (!data?.siteAvailability && !data?.matches) return false;
    if (data.matches) {
        return data.matches?.length > 0
    }
    return Object.values(data.siteAvailability).some(site =>
        site.matches.length > 0
    );
};

export const checkForAvailabilityInArray = (data) => {
    if (!data) return false;
    return data.some(site =>
        site.matches.length > 0
    );
};

export const checkForGroupAvailability = (group, grouped, showOrHide) => {
    if (!group || Object.values(group).length === 0) return false;

    const hasGroupAvailability = Object.values(group).map(campground => {
        const checkByCampground = checkForAvailability(campground);
        return checkByCampground;
    });

    const hasTrue = hasGroupAvailability.some(element => element === true)
    return hasTrue;
};

export const checkForGroupedAvailability = (campground) => {
    if (!campground?.sitesGroupedByFavorites) return false;

    const showHide = campground.showOrHide || {};

    // Loop through each group like "Favorites", "Worthwhile", etc.
    for (let key in campground.sitesGroupedByFavorites) {
        // Skip if this group is turned off
        if (!showHide[key]) continue;

        const groupSites = campground.sitesGroupedByFavorites[key];

        // Check if any site in this group has matches
        const hasGroupAvailability = groupSites.some(site => checkForAvailability(site));
        if (hasGroupAvailability) {
            return true; // Short-circuit as soon as we find availability
        }
    }

    // If we went through all allowed groups and found nothing
    return false;
};

export const getSitesWithMatches = (campground) => {
    return campground.filter(site => site.matches.length > 0);
};

export const getAllMatchesFromCampground = (campground) => {
    return campground.filter(site => site.matches.length > 0);
};

export const mergeObjects = objectsArray => objectsArray.reduce((acc, obj) => ({ ...acc, ...obj }), {});

export const getAllArraysFromParentObjects = (data, key) => {
    if (Array.isArray(data)) {
        const filterArrByKey = data.filter(item => {
            return key in item;
        }).map(item => item[key]);
        const mergeData = mergeObjects(filterArrByKey);
        return mergeData;
    } else {
        return null;
    }
}

export const getDateForCurrentMonth = (monthNum = 1) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + monthNum).padStart(2, '0'); // getMonth() is 0-based
    return `${year}-${month}-01`;
};

export const getDateForFutureMonth = (months) => {
    return getDateForCurrentMonth(months);
};

export const getEmptyGroupedSites = () => {
    return Object.values(siteGroups).reduce((acc, group) => {
        acc[group.label] = [];
        return acc;
    }, {});
};

export const getTotalGroups = (parents) => {
    let total = 0;
    for (let parentName in parents) {
        const campgroundData = parents[parentName];
        if (!Array.isArray(campgroundData)) continue;
        total += campgroundData.length;
    }
    return total;
}

export const buildReservationLink = (siteId, fromDate, nights) => {
    const from = new Date(fromDate);
    const to = new Date(from);
    to.setDate(from.getDate() + nights);
    const arrival = from.toISOString().split('T')[0];
    const departure = to.toISOString().split('T')[0];
    return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
};

export const goToPage = (data) => {
    const siteId = data.site.siteId;
    const fromDate = data.row.from;
    const nights = data.row.nights;
    const url = buildReservationLink(siteId, fromDate, nights);
    window.open(url, "_blank", "noreferrer");
};

export const deepMerge = (target, source) => {
    for (const key in source) {
        if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key])
        ) {
            // Ensure the target has this object
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            deepMerge(target[key], source[key]);
        } else {
            target[key] = source[key]; // Override or add
        }
    }
    return target;
};