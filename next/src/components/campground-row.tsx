"use client";

import { useState } from "react";
import { ChevronRight, Star, StarOff } from "lucide-react";

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AvailabilityStrip } from "@/components/availability-strip";
import { CampgroundDetail } from "@/components/campground-detail";
import { useCampgroundDetails } from "@/hooks/use-campground-details";
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

const DEFAULT_IMAGE = "/images/sites/bg_default.jpg";

// Format a local date as YYYY-MM-DD without timezone drift.
function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CampgroundRowProps {
    campground: ProcessedCampground;
    showExcluded: boolean;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    imageUrl: string;
    siteRatings?: SiteRatingsMap;
    onRatingChange?: (siteName: string, newRating: "favorite" | "worthwhile" | "unrated") => void;
    onEditSettings?: () => void;
    density?: "comfortable" | "compact";
    /** Narrows the availability strip and open-badge count to this window. */
    windowStart?: Date;
    windowEnd?: Date;
}

export function CampgroundRow({
    campground,
    showExcluded,
    isFavorite,
    onToggleFavorite,
    settings,
    globalSettings,
    imageUrl,
    siteRatings,
    onRatingChange,
    onEditSettings,
    density = "comfortable",
    windowStart,
    windowEnd,
}: CampgroundRowProps) {
    const [open, setOpen] = useState(false);

    // When the local image is the generic fallback, try to use the
    // recreation.gov preview image fetched server-side and cached in KV.
    const isLocalDefault = imageUrl === DEFAULT_IMAGE;
    const details = useCampgroundDetails(isLocalDefault ? campground.id : undefined);
    const effectiveImageUrl =
        isLocalDefault && details?.previewImageUrl ? details.previewImageUrl : imageUrl;

    const isCompact = density === "compact";

    // Count available stays within the active window (or all if no window).
    const totalAvailable = Object.values(
        campground.siteAvailability ?? {},
    ).reduce((acc, site) => {
        if (!windowStart || !windowEnd) {
            return acc + (site.matches?.length ?? 0);
        }
        // Count only matches whose range overlaps the window
        const winStartIso = toLocalIso(windowStart);
        const winEndIso = toLocalIso(windowEnd);
        const count = (site.matches ?? []).filter(
            (m) => m.from <= winEndIso && m.to > winStartIso,
        ).length;
        return acc + count;
    }, 0);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {/* Row — clicking anywhere opens the drawer */}
            <div
                className={cn(
                    "group flex items-center gap-3 rounded-lg border bg-card transition-all",
                    "cursor-pointer hover:border-primary/30 hover:shadow-sm",
                    isCompact ? "p-2" : "p-3",
                )}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                {/* Thumbnail */}
                <div
                    className={cn(
                        "shrink-0 overflow-hidden rounded-md bg-muted bg-cover bg-center",
                        isCompact ? "size-9" : "size-12",
                    )}
                    style={{ backgroundImage: `url(${effectiveImageUrl})` }}
                    aria-hidden
                />

                {/* Name + area */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className={cn(
                            "truncate font-display font-semibold leading-tight",
                            isCompact ? "text-sm" : "text-base",
                        )}>
                            {campground.name}
                        </h3>
                        {totalAvailable === 0 ? (
                            <Badge
                                variant="secondary"
                                className={cn("shrink-0", isCompact ? "text-[9px]" : "text-[10px]")}
                            >
                                Nothing open
                            </Badge>
                        ) : (
                            <Badge className={cn("shrink-0 bg-primary text-primary-foreground", isCompact ? "text-[9px]" : "text-[10px]")}>
                                {totalAvailable} open
                            </Badge>
                        )}
                    </div>
                    {!isCompact && (
                        <p className="truncate text-xs text-muted-foreground">
                            {campground.area ?? ""}
                        </p>
                    )}
                </div>

                {/* Availability strip — hidden on mobile */}
                <div className="hidden flex-1 max-w-md md:block">
                    <AvailabilityStrip
                        campground={campground}
                        showExcluded={showExcluded}
                        siteRatings={siteRatings}
                        windowStart={windowStart}
                        windowEnd={windowEnd}
                        className={isCompact ? "h-6" : "h-8"}
                    />
                </div>

                {/* Favorite toggle */}
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite();
                    }}
                    aria-label={
                        isFavorite ? "Remove favorite" : "Add favorite"
                    }
                >
                    {isFavorite ? (
                        <Star className="size-4 fill-primary text-primary" />
                    ) : (
                        <StarOff className="size-4 text-muted-foreground" />
                    )}
                </Button>

                {/* Chevron caret */}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>

            {/* Side drawer */}
            <SheetContent
                side="right"
                className="w-full overflow-y-auto px-6 data-[side=right]:sm:max-w-4xl sm:px-8"
            >
                <SheetHeader className="px-0">
                    <SheetTitle className="font-display text-xl">
                        {campground.name}
                    </SheetTitle>
                </SheetHeader>
                <CampgroundDetail
                    campground={campground}
                    showExcluded={showExcluded}
                    settings={settings}
                    globalSettings={globalSettings}
                    imageUrl={effectiveImageUrl}
                    siteRatings={siteRatings}
                    onRatingChange={onRatingChange}
                    onEditSettings={onEditSettings}
                />
            </SheetContent>
        </Sheet>
    );
}
