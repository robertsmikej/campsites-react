"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getTypeBadge } from "@/components/campground/type-badge";
import { checkForGroupedAvailability } from "@/lib/campground-utils";
import type { ProcessedCampground } from "@/types/campground";

import { Campground } from "./campground";

// ---------------------------------------------------------------------------
// Helpers (mirrors campgrounds-groups.tsx)
// ---------------------------------------------------------------------------

function getCampgroundUrl(campground: ProcessedCampground): string {
    return `https://www.recreation.gov/camping/campgrounds/${campground.id}`;
}

interface CampgroundStats {
    totalMatches: number;
    favoriteMatches: number;
    totalExcluded: number;
}

function getCampgroundStats(campground: ProcessedCampground): CampgroundStats {
    const grouped =
        campground.sitesGroupedByFavorites ??
        ({} as NonNullable<typeof campground.sitesGroupedByFavorites>);
    let totalMatches = 0;
    let favoriteMatches = 0;
    let totalExcluded = 0;
    (
        Object.entries(grouped) as [
            string,
            ProcessedCampground["sitesGroupedByFavorites"] extends Record<
                string,
                infer V
            >
                ? V
                : never,
        ][]
    ).forEach(([label, sites]) => {
        if (!Array.isArray(sites)) return;
        (
            sites as Array<{ matches?: unknown[]; excludedMatches?: unknown[] }>
        ).forEach((site) => {
            const matches = site.matches ?? [];
            totalMatches += matches.length;
            if (label === "Favorites") {
                favoriteMatches += matches.length;
            }
            totalExcluded += site.excludedMatches?.length ?? 0;
        });
    });
    return { totalMatches, favoriteMatches, totalExcluded };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CampgroundDetailProps {
    campground: ProcessedCampground;
    showExcluded: boolean;
    settings: { views?: { type?: "calendar" | "table" } };
    imageUrl: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampgroundDetail({
    campground,
    showExcluded,
    settings,
    imageUrl,
}: CampgroundDetailProps) {
    const hasCampgroundAvailability = checkForGroupedAvailability(campground);
    const stats = getCampgroundStats(campground);
    const badge = getTypeBadge(campground);
    const TypeIcon = badge.Icon;
    const viewMode = settings?.views?.type ?? "calendar";

    return (
        <div className="flex flex-col gap-4 pb-6">
            {/* Hero image */}
            <div className="relative aspect-[3/1] w-full overflow-hidden rounded-lg bg-muted sm:aspect-[5/1]">
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

            {/* Stats / info row */}
            <div className="flex flex-col gap-1.5 px-1">
                {campground.id && (
                    <span className="text-[0.65rem] leading-tight tracking-wide text-muted-foreground">
                        ID: {campground.id}
                    </span>
                )}
                {campground.description && (
                    <p className="text-sm text-muted-foreground">
                        {campground.description}
                    </p>
                )}

                {/* Status chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {!hasCampgroundAvailability ? (
                        <Badge
                            variant="secondary"
                            className="shrink-0 text-muted-foreground"
                        >
                            No availability
                        </Badge>
                    ) : null}
                    {campground.notifyAll && (
                        <Badge
                            variant="outline"
                            className="shrink-0 border-blue-400 text-blue-600"
                        >
                            Notify all
                        </Badge>
                    )}
                </div>

                {/* Stats chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                        Total: {stats.totalMatches}
                    </Badge>
                    <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
                        Favorites: {stats.favoriteMatches}
                    </Badge>
                    {stats.totalExcluded > 0 && (
                        <Badge
                            variant={showExcluded ? "default" : "outline"}
                            className={cn(
                                showExcluded
                                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                                    : "border-accent/50 text-accent",
                            )}
                        >
                            {stats.totalExcluded} excluded
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

                {/* Calendar legend */}
                {viewMode === "calendar" && (
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                        <div className="flex items-center gap-1.5">
                            <span className="size-3 rounded-full bg-primary" />
                            <span className="text-xs text-muted-foreground">
                                Matches filters
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="size-3 rounded-full bg-primary/20 ring-1 ring-primary/30" />
                            <span className="text-xs text-muted-foreground">
                                Available (wrong start day)
                            </span>
                        </div>
                        {showExcluded && (
                            <div className="flex items-center gap-1.5">
                                <span className="size-3 rounded-full bg-accent" />
                                <span className="text-xs text-muted-foreground">
                                    Excluded
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Site accordion + calendars — reuse the existing Campground component */}
            <div className="px-1">
                <Campground
                    campground={campground}
                    viewMode={viewMode}
                    showExcluded={showExcluded}
                />
            </div>
        </div>
    );
}
