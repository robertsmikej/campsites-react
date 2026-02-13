import { siteGroups } from '../constants/settings';

export const formatToMMDDYYYY = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
};

const dayNamesShort = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const dayNamesLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const getDayOfWeek = (dateStr, returnString = true, longForm = false) => {
    const dayNumber = new Date(dateStr).getUTCDay();
    return returnString ? longForm ? dayNamesLong[dayNumber] : dayNamesShort[dayNumber] : dayNumber;
};

export const getShortenedDayOfWeek = (dayStr) => {
    return dayNamesShort[dayNamesLong.indexOf(dayStr)];
}

export const sortBySiteName = (arr) => {
    return [...arr].sort((a, b) =>
        a.siteName.localeCompare(b.siteName, undefined, { sensitivity: 'base' })
    );
};

export const sortByFromDate = (arr) => {
    return [...arr].sort((a, b) =>
        a.from.localeCompare(b.from, undefined, { sensitivity: 'base' })
    );
};

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

const groupArrayOfObjectsByKey = (arr, key) => {
    if (!arr || !key) return;
    return arr.reduce((acc, obj) => {
        acc[obj[key]] = acc[obj[key]] || [];
        acc[obj[key]].push(obj);
        return acc;
    }, {});
};

export const flattenData = (data) => {
    return Object.values(data).flat();
};

export const checkForAppropriateGroups = (campgrounds = [], groups = siteGroups) => {
    if (!Array.isArray(campgrounds)) return [];
    const groupList = groups ? Object.values(groups) : [];
    return campgrounds.map(campground => {
        const updated = { ...campground };
        const showHide = { ...(updated.showOrHide ?? {}) };
        groupList.forEach(group => {
            if (typeof showHide[group.label] === 'undefined') {
                showHide[group.label] = group.default ?? true;
            }
        });
        updated.showOrHide = showHide;
        return updated;
    });
};

export const formatGroupsByFavorites = (data) => {
    // Deep clone to prevent mutations affecting original/cached data
    const clonedData = JSON.parse(JSON.stringify(data));
    let flattenedData = flattenData(clonedData);

    flattenedData.forEach(campground => {
        //Find if there's anything available in whole campground, set simple boolean to use elsewhere to check
        campground.hasAvailability = false;
        campground.sitesGroupedByFavorites = getEmptyGroupedSites();

        for (let siteId in campground.siteAvailability) {
            const site = campground.siteAvailability[siteId];
            if (site.matches?.length > 0) {
                campground.hasAvailability = true;
                if (campground.sites.favorites.includes(site.siteName)) {
                    campground.sitesGroupedByFavorites[siteGroups.favorites.label].push(site);
                } else if (campground.sites.worthwhile.includes(site.siteName)) {
                    campground.sitesGroupedByFavorites[siteGroups.worthwhile.label].push(site);
                } else {
                    campground.sitesGroupedByFavorites[siteGroups.allOthers.label].push(site);
                }
            }
        }
    });



    const campgroundsWithGroupSettings = checkForAppropriateGroups(flattenedData, siteGroups);

    // Preserve user-configured order from siteConfig - do not re-sort

    return campgroundsWithGroupSettings;
};

export const formatGroups = (data, removeParent = false, groupByKey = 'area') => {
    //Remove parent from object if needed and flattens all objects into one array
    if (removeParent) {
        data = flattenData(data);
    }
    //Groups data by a key provided, so by 'area of state' for example
    data = groupArrayOfObjectsByKey(data, groupByKey);
    return data;
}

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

export const goToPage = (data, month) => {
    console.log('data: ', data);
    const siteId = data.site?.siteId ?? data.siteId;
    const fromDate = data.row?.from ?? month;
    const nights = data.row?.nights ?? 1;
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

export const getLocalCurrentTime = () => {
    const options = {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    };

    return new Intl.DateTimeFormat("en-US", options).format(new Date());
};
