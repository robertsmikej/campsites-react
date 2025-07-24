import { flattenData } from './tables/formatRows';

// export const checkForIndividualAvailability = (data) => {
//     // console.log('data: ', data);
//     if (!data?.siteAvailability) return false;
//     // console.log('data: ', data)
//     const hasAvailability = Object.values(data.siteAvailability).some(site =>
//         site.matches.length > 0 || site.dates.length > 0
//     );
//     return hasAvailability;
// };

export const checkForAvailability = (data) => {
    // console.log('data: ', data);
    if (!data?.siteAvailability && !data?.matches) return false;
    if (data.matches) {
        return data.matches?.length > 0
    }
    return Object.values(data.siteAvailability).some(site =>
        site.matches.length > 0 || site.dates.length > 0
    );
};

export const checkForGroupAvailability = (group) => {
    // console.log('group: ', group);
    if (!group || Object.values(group).length === 0) return false;

    const hasGroupAvailability = Object.values(group).map(campground => {
        // console.log('campground: ', campground);
        const checkByCampground = checkForAvailability(campground);
        // console.log('checkForAvailability(site)', checkForAvailability(site));
        return checkByCampground;
    });
    // console.log('hasGroupAvailability: ', hasGroupAvailability);
    // console.log('group: ', group);
    return hasGroupAvailability;
};
