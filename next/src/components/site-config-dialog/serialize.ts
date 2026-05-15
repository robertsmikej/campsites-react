import type { Campground } from "@/types/campground";
import { CUSTOM_CATALOG_OPTION, DEFAULT_SHOW_HIDE, type EditableCampground } from "./types";

export const parseList = (value = ""): string[] =>
    value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

export function createEmptyCampground(): EditableCampground {
    return {
        name: "",
        area: "",
        site: "recreation.gov",
        type: "campground",
        id: "",
        description: "",
        dates: {
            startDate: "",
            endDate: "",
        },
        image: "",
        sites: {
            favorites: [],
            worthwhile: [],
        },
        showOrHide: { ...DEFAULT_SHOW_HIDE },
        enabled: true,
        favoritesText: "",
        worthwhileText: "",
        favoritesArray: [],
        worthwhileArray: [],
        catalogId: CUSTOM_CATALOG_OPTION,
    };
}

export function toEditableCampground(
    campground: Partial<Campground & EditableCampground> = {},
    validCatalogIds: Set<string> = new Set(),
): EditableCampground {
    const base = createEmptyCampground();
    const merged: EditableCampground = {
        ...base,
        ...campground,
        dates: {
            startDate: campground?.dates?.startDate ?? "",
            endDate: campground?.dates?.endDate ?? "",
        },
        site: campground?.site ?? base.site,
        type: campground?.type ?? base.type,
        image: campground?.image ?? "",
        sites: {
            favorites: campground?.sites?.favorites ?? [],
            worthwhile: campground?.sites?.worthwhile ?? [],
        },
        showOrHide: { ...DEFAULT_SHOW_HIDE, ...(campground?.showOrHide ?? {}) },
        enabled: campground?.enabled !== false,
        favoritesText: (campground?.sites?.favorites ?? []).join(", "),
        worthwhileText: (campground?.sites?.worthwhile ?? []).join(", "),
        favoritesArray: [...(campground?.sites?.favorites ?? [])],
        worthwhileArray: [...(campground?.sites?.worthwhile ?? [])],
        catalogId: validCatalogIds.has(campground?.id ?? "") ? (campground?.id ?? CUSTOM_CATALOG_OPTION) : CUSTOM_CATALOG_OPTION,
        validStartDays: campground?.validStartDays ?? undefined,
        stayLengths: campground?.stayLengths ?? undefined,
    };

    return merged;
}

export function sanitizeCampground(campground: EditableCampground): Campground {
    const favorites =
        campground.favoritesArray != null
            ? campground.favoritesArray
            : parseList(campground.favoritesText);
    const worthwhile =
        campground.worthwhileArray != null
            ? campground.worthwhileArray
            : parseList(campground.worthwhileText);

    return {
        name: campground.name.trim(),
        area: campground.area?.trim() ?? "",
        site: (campground.site || "recreation.gov").trim() || "recreation.gov",
        type: campground.type?.trim() || "campground",
        id: campground.id.trim(),
        description: campground.description ?? "",
        dates: {
            startDate: campground.dates?.startDate || "",
            endDate: campground.dates?.endDate || "",
        },
        image: campground.image || "",
        sites: {
            favorites,
            worthwhile,
        },
        showOrHide: {
            Favorites: campground.showOrHide?.["Favorites"] ?? DEFAULT_SHOW_HIDE["Favorites"],
            Worthwhile: campground.showOrHide?.["Worthwhile"] ?? DEFAULT_SHOW_HIDE["Worthwhile"],
            "All Others": campground.showOrHide?.["All Others"] ?? DEFAULT_SHOW_HIDE["All Others"],
        },
        ...(campground.validStartDays ? { validStartDays: campground.validStartDays } : {}),
        ...(campground.stayLengths ? { stayLengths: campground.stayLengths } : {}),
        ...(campground.notifyAll != null ? { notifyAll: campground.notifyAll } : {}),
        ...(campground.enabled === false ? { enabled: false } : {}),
    };
}
