// Shared types for the campground lookup (homepage + dashboard variants).

export type LookupState = "invalid" | "loading" | "on-list" | "watched" | "new" | "not-found";

export interface LookupCg {
    id: string;
    name: string;
    previewImageUrl?: string | null;
}

export interface LookupResult {
    state: LookupState;
    parsedId?: string;
    cg?: LookupCg;
}

export interface CampgroundLookupProps {
    variant?: "homepage" | "dashboard";
    /** Pre-fill the input and resolve it once on mount (e.g. a campground id
     * carried through sign-in via `/app?add=<id>`). Dashboard variant only. */
    initialQuery?: string;
}
