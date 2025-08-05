import { getDateForCurrentMonth, getDateForFutureMonth } from '../utils/utils';

export const defaultStartDate = getDateForCurrentMonth();
export const defaultEndDate = getDateForFutureMonth(3);
export const defaultStayLengths = [2, 3, 4, 5];
export const defaultValidStartDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const defaultPreferredStartDays = ['Thursday', 'Friday', 'Saturday'];
export const defaultIgnoreTypes = ['GROUP SHELTER NONELECTRIC', 'WALK TO', 'DAY USE'];

export const siteGroups = {
    favorites: {
        label: 'Favorites',
        default: true,
    },
    worthwhile: {
        label: 'Worthwhile',
        default: true
    },
    allOthers: {
        label: 'All Others',
        default: false
    },
};

export const sitewideDefaultSettings = (overrides) => {
    const settings = {
        dates: {
            startDate: overrides.dates.startDate ?? defaultStartDate,
            endDate: overrides.dates.endDate ?? defaultEndDate,
            validStartDays: overrides.dates.validStartDays ?? defaultValidStartDays, // Only include stays that start on these days
            preferredStartDays: overrides.dates.preferredStartDays ?? defaultPreferredStartDays, //Has to be formatted this way
            stayLengths: overrides.dates.stayLengths ?? defaultStayLengths,
        },
        ignoreTypes: overrides.ignoreTypes ?? defaultIgnoreTypes,
        showOrHideOverride: overrides.showOrHideOverride ?? Object.values(siteGroups).reduce((acc, group) => {
            acc[group.label] = group.default;
            return acc;
        }, {}),
    };

    return settings;
};
