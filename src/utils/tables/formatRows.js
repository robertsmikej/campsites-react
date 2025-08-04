export const flattenData = (data) => {
    return Object.values(data).flat();
};

const groupArrayOfObjectsByKey = (arr, key) => {
    if (!arr || !key) return;
    return arr.reduce((acc, obj) => {
        acc[obj[key]] = acc[obj[key]] || [];
        acc[obj[key]].push(obj);
        return acc;
    }, {});
};

export const formatRows = (data) => {
    console.log('group data: ', data);

    return data;
}

export const formatGroups = (data, removeParent = false, groupByKey = 'area') => {
    //Remove parent from object if needed and flattens all objects into one array
    if (removeParent) {
        data = flattenData(data);
    }
    //Groups data by a key provided, so by 'area of state' for example
    data = groupArrayOfObjectsByKey(data, groupByKey);
    return data;
}

export const formatToMMDDYYYY = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
};

export const getDayOfWeek = (dateStr, returnString = true) => {
    const dayNames = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
    const dayNumber = new Date(dateStr).getUTCDay();
    return returnString ? dayNames[dayNumber] : dayNumber;
};

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

export const formatGroupsByFavorites = (data) => {
    let flattenedData = flattenData(data);
    flattenedData.forEach(campground => {
        for (let siteId in campground.siteAvailability) {
            const site = campground.siteAvailability[siteId];
            if (campground.favorites.includes(site.siteName)) {
                campground.sitesGroupedByFavorites['Favorites'].push(site);
            } else if (campground.worthwhile.includes(site.siteName)) {
                campground.sitesGroupedByFavorites['Worthwhile'].push(site);
            } else {
                campground.sitesGroupedByFavorites['All Others'].push(site);
            }
        }
    });
    return flattenedData;
};