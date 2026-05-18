"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTypeBadge } from "@/components/campground/type-badge";
import { SiteRow } from "@/components/site-row";
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCampgroundUrl(campground: ProcessedCampground): string {
    return `https://www.recreation.gov/camping/campgrounds/${campground.id}`;
}

/** Total nights available across all sites (sum of StayMatch.nights). */
function countTotalNights(sites: SiteAvailability[]): number {
    return sites.reduce((acc, site) => {
        return (
            acc +
            (site.matches?.reduce((a, m) => {
                if (typeof m.nights === "number") return a + m.nights;
                const from = new Date(m.from + "T00:00:00");
                const to = new Date(m.to + "T00:00:00");
                return a + Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
            }, 0) ?? 0)
        );
    }, 0);
}

/** Sort sites: those with availability first (by nights desc), then the rest by site name. */
function sortSites(sites: SiteAvailability[]): SiteAvailability[] {
    return [...sites].sort((a, b) => {
        const aNights = countTotalNights([a]);
        const bNights = countTotalNights([b]);
        if (aNights !== bNights) return bNights - aNights;
        return a.siteName.localeCompare(b.siteName, undefined, { numeric: true });
    });
}

function groupSitesByRating(
    sites: SiteAvailability[],
    siteRatings: SiteRatingsMap | undefined,
): { favorites: SiteAvailability[]; worthwhile: SiteAvailability[]; others: SiteAvailability[] } {
    const favorites: SiteAvailability[] = [];
    const worthwhile: SiteAvailability[] = [];
    const others: SiteAvailability[] = [];
    for (const site of sites) {
        const rating = siteRatings?.[site.siteName];
        if (rating === "favorite") favorites.push(site);
        else if (rating === "worthwhile") worthwhile.push(site);
        else others.push(site);
    }
    return {
        favorites: sortSites(favorites),
        worthwhile: sortSites(worthwhile),
        others: sortSites(others),
    };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CampgroundDetailProps {
    campground: ProcessedCampground;
    showExcluded: boolean;
    settings: { views?: { type?: "calendar" | "table" } };
    imageUrl: string;
    siteRatings?: SiteRatingsMap;
    onRatingChange?: (siteName: string, newRating: "favorite" | "worthwhile" | "unrated") => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampgroundDetail({
    campground,
    showExcluded,
    imageUrl,
    siteRatings,
    onRatingChange,
}: CampgroundDetailProps) {
    const badge = getTypeBadge(campground);
    const TypeIcon = badge.Icon;

    const allSites: SiteAvailability[] = Object.values(
        campground.siteAvailability ?? {},
    );
    const grouped = groupSitesByRating(allSites, siteRatings);
    const totalNights = countTotalNights(allSites);
    const sitesWithAvailability = allSites.filter(
        (s) => (s.matches?.length ?? 0) > 0,
    ).length;

    const renderSiteRow = (site: SiteAvailability) => (
        <SiteRow
            key={site.siteId}
            site={site}
            campground={campground}
            showExcluded={showExcluded}
            rating={siteRatings ? (siteRatings[site.siteName] ?? "unrated") : undefined}
            onRatingChange={
                onRatingChange
                    ? (newRating) => onRatingChange(site.siteName, newRating)
                    : undefined
            }
        />
    );

    return (
        <div className="flex flex-col gap-4 pb-6">
            {/* Hero image */}
            <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg bg-muted sm:aspect-[5/1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover object-center"
                />
                {/* gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/5" />

                {/* type badge top-right */}
                <div className="absolute right-3 top-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-md">
                        <TypeIcon
                            className="size-3.5 shrink-0"
                            style={{ color: badge.color }}
                            aria-hidden
                        />
                        {badge.label}
                    </span>
                </div>

                {/* name + area overlaid bottom-left */}
                <div className="absolute inset-x-3 bottom-2 flex items-end justify-between gap-2">
                    <div className="min-w-0 text-white">
                        <h2 className="font-display truncate text-xl font-semibold tracking-tight drop-shadow-sm">
                            {campground.name}
                        </h2>
                        {campground.area ? (
                            <p className="truncate text-xs text-white/85">
                                {campground.area}
                            </p>
                        ) : null}
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                href={getCampgroundUrl(campground)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex text-white/80 hover:text-white"
                            >
                                <ExternalLink className="size-3.5" />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent>View on recreation.gov</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Stats summary line */}
            <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">
                        {allSites.length} site{allSites.length !== 1 ? "s" : ""}
                        {totalNights > 0 ? (
                            <>
                                {" · "}
                                <span className="font-medium text-foreground">
                                    {totalNights} night
                                    {totalNights !== 1 ? "s" : ""} open
                                </span>
                            </>
                        ) : null}
                    </span>
                    {campground.notifyAll && (
                        <Badge
                            variant="outline"
                            className="shrink-0 border-blue-400 text-blue-600"
                        >
                            Notify all
                        </Badge>
                    )}
                    {campground.validStartDays &&
                        campground.validStartDays.length < 7 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge
                                        variant="outline"
                                        className="text-[0.7rem]"
                                    >
                                        {campground.validStartDays
                                            .map((d) => d.slice(0, 3))
                                            .join(", ")}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    Only showing stays starting on:{" "}
                                    {campground.validStartDays.join(", ")}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    {campground.stayLengths && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge
                                    variant="outline"
                                    className="text-[0.7rem]"
                                >
                                    {Math.min(...campground.stayLengths)}–
                                    {Math.max(...campground.stayLengths)}n
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                Custom stay length:{" "}
                                {Math.min(...campground.stayLengths)}–
                                {Math.max(...campground.stayLengths)} nights
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                {campground.description && (
                    <p className="text-sm text-muted-foreground">
                        {campground.description}
                    </p>
                )}
            </div>

            {/* Grouped site list */}
            <div className={cn("flex flex-col gap-4")}>
                {allSites.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        No availability info loaded yet — try refreshing.
                    </p>
                ) : (
                    <>
                        {sitesWithAvailability === 0 && (
                            <p className="text-sm text-muted-foreground">No open sites right now.</p>
                        )}
                        {grouped.favorites.length > 0 && (
                            <section className="flex flex-col gap-1.5">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                                    Favorites · {grouped.favorites.length}
                                </h3>
                                {grouped.favorites.map(renderSiteRow)}
                            </section>
                        )}
                        {grouped.worthwhile.length > 0 && (
                            <section className="flex flex-col gap-1.5">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                                    Worthwhile · {grouped.worthwhile.length}
                                </h3>
                                {grouped.worthwhile.map(renderSiteRow)}
                            </section>
                        )}
                        {grouped.others.length > 0 && (
                            <section className="flex flex-col gap-1.5">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Other sites · {grouped.others.length}
                                </h3>
                                {grouped.others.map(renderSiteRow)}
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
