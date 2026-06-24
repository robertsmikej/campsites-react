import type { Campground } from "@/types/campground";
import { defaultDates } from "@/lib/default-dates";

// Heuristic: does this input look like a URL attempt (vs a name search)?
export function looksLikeUrlAttempt(s: string): boolean {
    return /:\/\/|recreation\.gov/i.test(s);
}

// Parse a recreation.gov URL or bare numeric ID into a facility id.
export function parseInput(s: string): string | null {
    if (!s) return null;
    const trimmed = s.trim();
    // URL: recreation.gov/camping/campgrounds/233137 etc.
    const urlMatch = trimmed.match(/recreation\.gov\/[^?#]*?\/(\d{4,7})(?:[/?#]|$)/i);
    if (urlMatch) return urlMatch[1] ?? null;
    // Bare numeric ID
    if (/^\d{4,7}$/.test(trimmed)) return trimmed;
    return null;
}

// Build a default Campground entry for a new addition.
export function buildNewCampground(id: string, name: string, previewImageUrl?: string | null): Campground {
    return {
        id,
        name,
        image: previewImageUrl ?? undefined,
        // Shared season-capped window (never defaults past Sep 30) — keeps this
        // add path consistent with the site-config dialog's.
        dates: defaultDates(),
        sites: { favorites: [], worthwhile: [] },
        notifyAll: false,
        addedAt: new Date().toISOString(),
    };
}
