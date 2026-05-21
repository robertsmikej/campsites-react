import type { ProcessedCampground } from "@/types/campground";

const DEFAULT_IMAGE = "/images/sites/bg_default.jpg";

/**
 * Resolve the display image URL for a campground.
 *
 * Rules (matching the logic in campgrounds-list.tsx):
 *   1. If the campground has an image that isn't a map screenshot, use it.
 *      - If already an absolute URL, use as-is.
 *      - If it starts with "/images/", use as-is.
 *      - Otherwise prefix "/images/sites/".
 *   2. Fall back to DEFAULT_IMAGE.
 *
 * CampgroundRow also falls back to a KV-fetched preview image when this
 * returns DEFAULT_IMAGE; that logic stays in the row itself since it
 * requires a hook call.
 */
export function getCampgroundImageUrl(campground: ProcessedCampground): string {
    const img = campground.image;
    if (img && !/_map.*\.jpg$/i.test(img)) {
        if (img.startsWith("http")) return img;
        return img.startsWith("/images/") ? img : `/images/sites/${img}`;
    }
    return DEFAULT_IMAGE;
}

export { DEFAULT_IMAGE };
