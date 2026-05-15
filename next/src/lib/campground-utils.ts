import type {
    Campground,
    SiteAvailability,
    ProcessedCampground,
    StayMatch,
} from "@/types/campground";
import { siteGroups } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Date / day helpers
// ---------------------------------------------------------------------------

export const formatToMMDDYYYY = (dateStr: string): string => {
    const [year, month, day] = dateStr.split("-");
    return `${month}/${day}/${year}`;
};

const dayNamesShort = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const dayNamesLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getDayOfWeek(dateStr: string, returnString: false): number;
export function getDayOfWeek(dateStr: string, returnString?: true, longForm?: boolean): string;
export function getDayOfWeek(
    dateStr: string,
    returnString: boolean = true,
    longForm: boolean = false,
): string | number {
    const dayNumber = new Date(dateStr).getUTCDay();
    if (!returnString) return dayNumber;
    return longForm ? dayNamesLong[dayNumber] : dayNamesShort[dayNumber];
}

export const getShortenedDayOfWeek = (dayStr: string): string => {
    return dayNamesShort[dayNamesLong.indexOf(dayStr)];
};

export const getDateForCurrentMonth = (monthNum = 1): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + monthNum).padStart(2, "0");
    return `${year}-${month}-01`;
};

export const getDateForFutureMonth = (months: number): string => {
    return getDateForCurrentMonth(months);
};

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

export const sortBySiteName = (arr: SiteAvailability[]): SiteAvailability[] => {
    return [...arr].sort((a, b) =>
        a.siteName.localeCompare(b.siteName, undefined, { sensitivity: "base" }),
    );
};

export const sortByFromDate = (arr: StayMatch[]): StayMatch[] => {
    return [...arr].sort((a, b) =>
        a.from.localeCompare(b.from, undefined, { sensitivity: "base" }),
    );
};

// ---------------------------------------------------------------------------
// Availability checks
// ---------------------------------------------------------------------------

export const checkForAvailability = (
    data: Partial<ProcessedCampground> | SiteAvailability | null | undefined,
): boolean => {
    if (!data) return false;
    if (!("siteAvailability" in data) && !("matches" in data)) return false;
    if ("matches" in data && data.matches) {
        return data.matches.length > 0;
    }
    if ("siteAvailability" in data && data.siteAvailability) {
        return Object.values(data.siteAvailability).some((site) => site.matches.length > 0);
    }
    return false;
};

export const checkForAvailabilityInArray = (data: SiteAvailability[] | null | undefined): boolean => {
    if (!data) return false;
    return data.some((site) => site.matches.length > 0);
};

export const checkForGroupAvailability = (
    group: Record<string, ProcessedCampground> | null | undefined,
    _grouped?: unknown,
    _showOrHide?: unknown,
): boolean => {
    if (!group || Object.values(group).length === 0) return false;
    const hasGroupAvailability = Object.values(group).map((campground) =>
        checkForAvailability(campground),
    );
    return hasGroupAvailability.some((element) => element === true);
};

export const checkForGroupedAvailability = (campground: ProcessedCampground | null | undefined): boolean => {
    if (!campground?.sitesGroupedByFavorites) return false;

    const showHide = campground.showOrHide ?? {};

    for (const key in campground.sitesGroupedByFavorites) {
        if (!showHide[key as keyof typeof showHide]) continue;
        const groupSites =
            campground.sitesGroupedByFavorites[key as keyof typeof campground.sitesGroupedByFavorites];
        const hasGroupAvailability = groupSites.some((site) => checkForAvailability(site));
        if (hasGroupAvailability) return true;
    }

    return false;
};

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

const groupArrayOfObjectsByKey = <T extends Record<string, unknown>>(
    arr: T[] | null | undefined,
    key: string,
): Record<string, T[]> | undefined => {
    if (!arr || !key) return undefined;
    return arr.reduce(
        (acc, obj) => {
            const k = String(obj[key]);
            acc[k] = acc[k] || [];
            acc[k].push(obj);
            return acc;
        },
        {} as Record<string, T[]>,
    );
};

export const flattenData = <T>(data: Record<string, T[]>): T[] => {
    return Object.values(data).flat();
};

export const checkForAppropriateGroups = (
    campgrounds: ProcessedCampground[] = [],
    groups: typeof siteGroups = siteGroups,
): ProcessedCampground[] => {
    if (!Array.isArray(campgrounds)) return [];
    const groupList = groups ? Object.values(groups) : [];
    return campgrounds.map((campground) => {
        const updated = { ...campground };
        const showHide = { ...(updated.showOrHide ?? {}) };
        groupList.forEach((group) => {
            const label = group.label as keyof typeof showHide;
            if (typeof showHide[label] === "undefined") {
                (showHide as Record<string, boolean>)[group.label] = group.default ?? true;
            }
        });
        updated.showOrHide = showHide;
        return updated;
    });
};

export const formatGroupsByFavorites = (
    data: Record<string, ProcessedCampground[]>,
): ProcessedCampground[] => {
    const clonedData: Record<string, ProcessedCampground[]> = JSON.parse(JSON.stringify(data));
    const flattenedData = flattenData(clonedData);

    flattenedData.forEach((campground) => {
        campground.hasAvailability = false;
        campground.sitesGroupedByFavorites = getEmptyGroupedSites();

        const favoritesSet = new Set(campground.sites.favorites);
        const worthwhileSet = new Set(campground.sites.worthwhile);

        for (const siteId in campground.siteAvailability) {
            const site = campground.siteAvailability[siteId];
            if ((site.matches?.length ?? 0) > 0 || (site.excludedMatches?.length ?? 0) > 0) {
                if ((site.matches?.length ?? 0) > 0) {
                    campground.hasAvailability = true;
                }
                if (favoritesSet.has(site.siteName)) {
                    campground.sitesGroupedByFavorites![siteGroups.favorites.label].push(site);
                } else if (worthwhileSet.has(site.siteName)) {
                    campground.sitesGroupedByFavorites![siteGroups.worthwhile.label].push(site);
                } else {
                    campground.sitesGroupedByFavorites![siteGroups.allOthers.label].push(site);
                }
            }
        }
    });

    return checkForAppropriateGroups(flattenedData, siteGroups);
};

export const formatGroups = (
    data: ProcessedCampground[] | Record<string, ProcessedCampground[]>,
    removeParent = false,
    groupByKey = "area",
): Record<string, ProcessedCampground[]> | undefined => {
    let normalized: ProcessedCampground[];
    if (removeParent) {
        normalized = flattenData(data as Record<string, ProcessedCampground[]>);
    } else {
        normalized = data as ProcessedCampground[];
    }
    return groupArrayOfObjectsByKey(normalized as unknown as Array<Record<string, unknown>>, groupByKey) as Record<string, ProcessedCampground[]> | undefined;
};

export const getSitesWithMatches = (campground: SiteAvailability[]): SiteAvailability[] => {
    return campground.filter((site) => site.matches.length > 0);
};

export const getAllMatchesFromCampground = (campground: SiteAvailability[]): SiteAvailability[] => {
    return campground.filter((site) => site.matches.length > 0);
};

export const mergeObjects = <T extends Record<string, unknown>>(objectsArray: T[]): T => {
    return objectsArray.reduce((acc, obj) => ({ ...acc, ...obj }), {} as T);
};

export const getAllArraysFromParentObjects = <T>(
    data: Array<Record<string, T>>,
    key: string,
): Record<string, T> | null => {
    if (Array.isArray(data)) {
        const filterArrByKey = data
            .filter((item) => key in item)
            .map((item) => item[key] as Record<string, T>);
        return mergeObjects(filterArrByKey as Array<Record<string, unknown>>) as Record<string, T>;
    }
    return null;
};

// ---------------------------------------------------------------------------
// Grouped sites
// ---------------------------------------------------------------------------

export const getEmptyGroupedSites = (): {
    Favorites: SiteAvailability[];
    Worthwhile: SiteAvailability[];
    "All Others": SiteAvailability[];
} => {
    return Object.values(siteGroups).reduce(
        (acc, group) => {
            (acc as Record<string, SiteAvailability[]>)[group.label] = [];
            return acc;
        },
        {} as { Favorites: SiteAvailability[]; Worthwhile: SiteAvailability[]; "All Others": SiteAvailability[] },
    );
};

export const getTotalGroups = (parents: Record<string, unknown>): number => {
    let total = 0;
    for (const parentName in parents) {
        const campgroundData = parents[parentName];
        if (!Array.isArray(campgroundData)) continue;
        total += campgroundData.length;
    }
    return total;
};

// ---------------------------------------------------------------------------
// Links / navigation
// ---------------------------------------------------------------------------

export const buildReservationLink = (siteId: string, fromDate: string, nights: number): string => {
    const from = new Date(fromDate);
    const to = new Date(from);
    to.setDate(from.getDate() + nights);
    const arrival = from.toISOString().split("T")[0];
    const departure = to.toISOString().split("T")[0];
    return `https://www.recreation.gov/camping/campsites/${siteId}?arrivalDate=${arrival}&departureDate=${departure}`;
};

interface GoToPageData {
    site?: { siteId?: string };
    siteId?: string;
    row?: { from?: string; nights?: number };
}

export const goToPage = (data: GoToPageData, month: string): void => {
    if (typeof window === "undefined") return;
    const siteId = data.site?.siteId ?? data.siteId ?? "";
    const fromDate = data.row?.from ?? month;
    const nights = data.row?.nights ?? 1;
    const url = buildReservationLink(siteId, fromDate, nights);
    window.open(url, "_blank", "noreferrer");
};

// ---------------------------------------------------------------------------
// Deep merge
// ---------------------------------------------------------------------------

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    for (const key in source) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === "object" && !Array.isArray(sv)) {
            if (!tv || typeof tv !== "object") {
                (target as Record<string, unknown>)[key] = {};
            }
            deepMerge(
                (target as Record<string, unknown>)[key] as Record<string, unknown>,
                sv as Record<string, unknown>,
            );
        } else {
            (target as Record<string, unknown>)[key] = sv;
        }
    }
    return target;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export const getLocalCurrentTime = (): string => {
    const options: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    };
    return new Intl.DateTimeFormat("en-US", options).format(new Date());
};
