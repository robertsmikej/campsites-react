// Change detection: compare current matches against previous state
// to identify NEW availability that should trigger a notification.

import type { StayMatch } from '../../next/src/types/campground';
import type { SiteAvailabilityMap } from './fetch-availability';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampgroundResult {
    campgroundId: string;
    campgroundName: string;
    campgroundArea: string;
    campgroundDescription: string;
    sites: SiteAvailabilityMap;
}

export interface SiteConfigForDiff {
    id: string;
    sites: {
        favorites: string[];
        worthwhile: string[];
    };
    notifyAll: boolean;
}

export type MatchGroup = 'favorites' | 'worthwhile' | 'all-others';

export interface MatchResult {
    campgroundId: string;
    campgroundName: string;
    campgroundArea: string;
    campgroundDescription: string;
    siteId: string;
    siteName: string;
    match: StayMatch;
    group: MatchGroup;
}

// ── Exported functions ────────────────────────────────────────────────────────

// Generate a deterministic signature string for a match
export const generateSignature = (campgroundId: string, siteId: string, match: StayMatch): string => {
    return `${campgroundId}:${siteId}:${match.from}:${match.to}:${match.nights}`;
};

// Find matches in current results that weren't in the previous signature set
export const findNewMatches = (
    currentResults: CampgroundResult[],
    previousSignatures: Set<string>,
    siteConfigurations: SiteConfigForDiff[],
): MatchResult[] => {
    const newMatches: MatchResult[] = [];

    for (const result of currentResults) {
        const config = siteConfigurations.find((c) => c.id === result.campgroundId);
        const favorites = new Set(config?.sites?.favorites ?? []);
        const worthwhile = new Set(config?.sites?.worthwhile ?? []);

        for (const [siteId, site] of Object.entries(result.sites)) {
            for (const match of site.matches ?? []) {
                const signature = generateSignature(result.campgroundId, siteId, match);
                if (!previousSignatures.has(signature)) {
                    let group: MatchGroup = 'all-others';
                    if (favorites.has(site.siteName)) group = 'favorites';
                    else if (worthwhile.has(site.siteName)) group = 'worthwhile';

                    newMatches.push({
                        campgroundId: result.campgroundId,
                        campgroundName: result.campgroundName,
                        campgroundArea: result.campgroundArea,
                        campgroundDescription: result.campgroundDescription,
                        siteId,
                        siteName: site.siteName,
                        match,
                        group,
                    });
                }
            }
        }
    }

    return newMatches;
};
