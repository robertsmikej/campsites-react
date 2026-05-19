"use client";

import { useState } from "react";
import { Filter, Map as MapIcon, Satellite } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTypeBadge } from "@/components/campground/type-badge";
import { SiteRow } from "@/components/site-row";
import { useCampgroundDetails } from "@/hooks/use-campground-details";
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground, SiteAvailability, GlobalSettings } from "@/types/campground";

// ---------------------------------------------------------------------------
// Filter summary helpers
// ---------------------------------------------------------------------------

type FilterSummaryItem = { label: string; value: string; source: "global" | "campground" };

interface FilterSummary {
    items: FilterSummaryItem[];
    notifyAll: boolean;
}

function buildFilterSummary(
    campground: ProcessedCampground,
    globalSettings: GlobalSettings | undefined,
): FilterSummary {
    const items: FilterSummaryItem[] = [];

    // Stay length — campground-level overrides global
    const cgStayLengths = campground.stayLengths;
    const stayLengths = cgStayLengths ?? globalSettings?.stayLengths;
    if (stayLengths && stayLengths.length > 0) {
        const min = Math.min(...stayLengths);
        const max = Math.max(...stayLengths);
        const value =
            min === max
                ? `${min} night${min === 1 ? "" : "s"}`
                : `${min}–${max} nights`;
        items.push({
            label: "Stay length",
            value,
            source: cgStayLengths ? "campground" : "global",
        });
    }

    // Valid start days — campground-level overrides global; skip if all 7 days
    const cgValidDays = campground.validStartDays;
    const validDays = cgValidDays ?? globalSettings?.validStartDays;
    if (validDays && validDays.length > 0 && validDays.length < 7) {
        const value = validDays.map((d) => d.slice(0, 3)).join(", ");
        items.push({
            label: "Start days",
            value,
            source: cgValidDays ? "campground" : "global",
        });
    }

    return { items, notifyAll: !!campground.notifyAll };
}

// ---------------------------------------------------------------------------
// Other helpers
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
    globalSettings?: GlobalSettings;
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
    globalSettings,
    imageUrl,
    siteRatings,
    onRatingChange,
}: CampgroundDetailProps) {
    const badge = getTypeBadge(campground);
    const TypeIcon = badge.Icon;
    const details = useCampgroundDetails(campground.id);

    // Per-drawer "show without filters" toggle — additive on top of the global toggle
    const [localShowExcluded, setLocalShowExcluded] = useState(false);
    const effectiveShowExcluded = showExcluded || localShowExcluded;

    const filterSummary = buildFilterSummary(campground, globalSettings);

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
            showExcluded={effectiveShowExcluded}
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

                {/* name + area overlaid bottom-left, map buttons bottom-right */}
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
                    <div className="flex items-center gap-1.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <a
                                    href={getCampgroundUrl(campground)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-md hover:bg-background"
                                >
                                    <MapIcon className="size-3.5" aria-hidden />
                                    Layout
                                </a>
                            </TooltipTrigger>
                            <TooltipContent>Campground layout on recreation.gov</TooltipContent>
                        </Tooltip>
                        {details?.latitude != null && details?.longitude != null && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <a
                                        href={`https://www.google.com/maps/@${details.latitude},${details.longitude},17z/data=!3m1!1e3`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-md hover:bg-background"
                                    >
                                        <Satellite className="size-3.5" aria-hidden />
                                        Satellite
                                    </a>
                                </TooltipTrigger>
                                <TooltipContent>Google Maps satellite view</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
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
                </div>
                {campground.description && (
                    <p className="text-sm text-muted-foreground">
                        {campground.description}
                    </p>
                )}
            </div>

            {/* Filters-applied callout — only rendered when there are active filters */}
            {filterSummary.items.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <Filter className="size-3.5 text-muted-foreground" aria-hidden />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Filters applied
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch
                                id={`show-without-filters-${campground.id}`}
                                checked={localShowExcluded}
                                onCheckedChange={setLocalShowExcluded}
                            />
                            <Label
                                htmlFor={`show-without-filters-${campground.id}`}
                                className="text-xs text-muted-foreground"
                            >
                                Show without filters
                            </Label>
                        </div>
                    </div>
                    <ul className="space-y-1">
                        {filterSummary.items.map((item) => (
                            <li
                                key={item.label}
                                className="flex items-center justify-between gap-2 text-xs"
                            >
                                <span className="text-muted-foreground">{item.label}</span>
                                <span className="flex items-center gap-1.5">
                                    <span className="font-medium text-foreground">
                                        {item.value}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className="h-4 text-[9px] uppercase tracking-wide"
                                    >
                                        {item.source}
                                    </Badge>
                                </span>
                            </li>
                        ))}
                        {filterSummary.notifyAll && (
                            <li className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">Notifications</span>
                                <span className="font-medium text-foreground">All matches</span>
                            </li>
                        )}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        Filtered dates are hidden until you toggle &ldquo;Show without
                        filters&rdquo; on.
                    </p>
                </div>
            )}

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
