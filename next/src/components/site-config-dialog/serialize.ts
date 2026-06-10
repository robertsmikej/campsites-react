import type { Campground } from "@/types/campground";
import { HIGH_PRIORITY_CAP } from "@/types/campground";
import { DEFAULT_SHOW_HIDE, type EditableCampground } from "./types";

/**
 * Re-enabling a "high" campground when the cap is already filled by OTHER
 * enabled campgrounds demotes it to normal (absent) instead of overflowing.
 */
export function enableWithHighCapCheck(
    campgrounds: EditableCampground[],
    index: number,
): EditableCampground {
    const target = campgrounds[index]!;
    const otherEnabledHighs = campgrounds.filter(
        (c, i) => i !== index && c.checkPriority === "high" && c.enabled !== false,
    ).length;
    if (target.checkPriority === "high" && otherEnabledHighs >= HIGH_PRIORITY_CAP) {
        return { ...target, enabled: true, checkPriority: undefined };
    }
    return { ...target, enabled: true };
}

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
    };
}

// Accepts both Campground (from the API/config) and EditableCampground (round-trip editing).
// We use a loose input type to avoid fighting the showOrHide partial/full mismatch.
export function toEditableCampground(
    campground: Campground | Record<string, unknown> = {},
): EditableCampground {
    const cg = campground as Partial<EditableCampground>;
    const base = createEmptyCampground();
    const merged: EditableCampground = {
        ...base,
        ...cg,
        dates: {
            startDate: cg?.dates?.startDate ?? "",
            endDate: cg?.dates?.endDate ?? "",
        },
        site: cg?.site ?? base.site,
        type: cg?.type ?? base.type,
        image: cg?.image ?? "",
        sites: {
            favorites: cg?.sites?.favorites ?? [],
            worthwhile: cg?.sites?.worthwhile ?? [],
        },
        showOrHide: { ...DEFAULT_SHOW_HIDE, ...(cg?.showOrHide ?? {}) },
        enabled: cg?.enabled !== false,
        favoritesText: (cg?.sites?.favorites ?? []).join(", "),
        worthwhileText: (cg?.sites?.worthwhile ?? []).join(", "),
        favoritesArray: [...(cg?.sites?.favorites ?? [])],
        worthwhileArray: [...(cg?.sites?.worthwhile ?? [])],
        checkPriority: cg?.checkPriority,
        validStartDays: cg?.validStartDays ?? undefined,
        stayLengths: cg?.stayLengths ?? undefined,
    };

    return merged;
}

export function sanitizeCampground(campground: EditableCampground): Campground {
    // The *Text fields are the canonical edit buffer: both the multi-select
    // (which sets *Text alongside *Array) and the comma-separated textarea (which
    // sets only *Text) keep them current, and toEditableCampground seeds them
    // from the saved favorites. *Array can lag behind the textarea, so deriving
    // from text is what makes dialog edits actually persist (add and clear alike).
    const favorites = parseList(campground.favoritesText);
    const worthwhile = parseList(campground.worthwhileText);

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
        ...(campground.notifyScope ? { notifyScope: campground.notifyScope } : {}),
        ...(campground.notifyAll != null ? { notifyAll: campground.notifyAll } : {}),
        // Omit "normal" — absent means normal by convention, keeping stored data sparse.
        ...(campground.checkPriority && campground.checkPriority !== "normal"
            ? { checkPriority: campground.checkPriority }
            : {}),
        ...(campground.enabled === false ? { enabled: false } : {}),
    };
}
