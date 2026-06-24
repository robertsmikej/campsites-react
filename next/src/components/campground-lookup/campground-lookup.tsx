"use client";

import { DashboardLookup } from "./dashboard-lookup";
import { HomepageLookup } from "./homepage-lookup";
import type { CampgroundLookupProps } from "./types";

export type { CampgroundLookupProps };

// Two layouts over one shared lookup hook: the marketing homepage section and the
// compact dashboard/dialog embed.
export function CampgroundLookup({ variant = "homepage", initialQuery }: CampgroundLookupProps) {
    return variant === "dashboard" ? <DashboardLookup initialQuery={initialQuery} /> : <HomepageLookup />;
}
