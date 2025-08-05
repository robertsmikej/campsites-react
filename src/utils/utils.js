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

export const checkForGroupAvailability = (group) => {
    if (!group || Object.values(group).length === 0) return false;

    const hasGroupAvailability = Object.values(group).map(campground => {
        const checkByCampground = checkForAvailability(campground);
        return checkByCampground;
    });

    const hasTrue = hasGroupAvailability.some(element => element === true)
    return hasTrue;
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