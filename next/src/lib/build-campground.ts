import type { Campground } from "@/types/campground";
import type { FacilitySummary } from "./recgov-facility";

/**
 * Builds a watchlist Campground from a recreation.gov facility summary and a
 * chosen date window. Stamps `addedAt` so that, on the curator's record, the
 * "recently added" nudge can date this addition.
 */
export function buildCampgroundFromFacility(
    preview: FacilitySummary,
    dates: { startDate: string; endDate: string },
): Campground {
    const campground: Campground = {
        id: preview.id,
        name: preview.name.trim(),
        site: "recreation.gov",
        type: preview.type,
        sites: { favorites: [], worthwhile: [] },
        showOrHide: { Favorites: true, Worthwhile: true, "All Others": true },
        enabled: true,
        dates: { startDate: dates.startDate, endDate: dates.endDate },
        addedAt: new Date().toISOString(),
    };
    if (preview.area?.trim()) campground.area = preview.area.trim();
    if (preview.description?.trim()) campground.description = preview.description.trim();
    if (preview.imageUrl?.trim()) campground.image = preview.imageUrl.trim();
    return campground;
}
