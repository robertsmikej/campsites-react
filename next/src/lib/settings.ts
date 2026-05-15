export const getDateForCurrentMonth = (monthNum = 1): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + monthNum).padStart(2, "0");
    return `${year}-${month}-01`;
};

export const getDateForFutureMonth = (months: number): string => {
    return getDateForCurrentMonth(months);
};

export const defaultStartDate = getDateForCurrentMonth();
export const defaultEndDate = getDateForFutureMonth(3);
export const defaultStayLengths = [2, 3, 4, 5];
export const defaultValidStartDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
export const defaultPreferredStartDays = ["Thursday", "Friday", "Saturday"];
export const defaultIgnoreTypes = ["GROUP SHELTER NONELECTRIC", "WALK TO", "DAY USE"];

export const siteGroups = {
    favorites: {
        label: "Favorites",
        default: true,
    },
    worthwhile: {
        label: "Worthwhile",
        default: true,
    },
    allOthers: {
        label: "All Others",
        default: true,
    },
} as const;

export type SiteGroupKey = keyof typeof siteGroups;
export type SiteGroupLabel = (typeof siteGroups)[SiteGroupKey]["label"];

export interface DefaultSettings {
    dates: {
        startDate: string;
        endDate: string;
        validStartDays: string[];
        preferredStartDays: string[];
        stayLengths: number[];
    };
    ignoreTypes: string[];
    views: {
        type: string;
    };
}

export const defaultSettings: DefaultSettings = {
    dates: {
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        validStartDays: defaultValidStartDays,
        preferredStartDays: defaultPreferredStartDays,
        stayLengths: defaultStayLengths,
    },
    ignoreTypes: defaultIgnoreTypes,
    views: {
        type: "table",
    },
};

// Local deep-merge to avoid a circular import with campground-utils
// (campground-utils imports siteGroups from this module)
function localDeepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    for (const key in source) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv)) {
            if (!tv || typeof tv !== "object") {
                (target as Record<string, unknown>)[key] = {};
            }
            localDeepMerge(
                (target as Record<string, unknown>)[key] as Record<string, unknown>,
                sv as Record<string, unknown>,
            );
        } else {
            (target as Record<string, unknown>)[key] = sv;
        }
    }
    return target;
}

export const getSitewideDefaultSettings = (overrides: Partial<DefaultSettings>): DefaultSettings => {
    return localDeepMerge({ ...defaultSettings } as Record<string, unknown>, overrides as Record<string, unknown>) as unknown as DefaultSettings;
};
