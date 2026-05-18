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
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground } from "@/types/campground";

interface CampgroundRowProps {
    campground: ProcessedCampground;
    showExcluded: boolean;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    settings: { views?: { type?: "calendar" | "table" } };
    imageUrl: string;
    siteRatings?: SiteRatingsMap;
    onRatingChange?: (siteName: string, newRating: "favorite" | "worthwhile" | "unrated") => void;
}

export function CampgroundRow({
    campground,
    showExcluded,
    isFavorite,
    onToggleFavorite,
    settings,
    imageUrl,
    siteRatings,
    onRatingChange,
}: CampgroundRowProps) {
    const [open, setOpen] = useState(false);

    // Count total available stays (match ranges, not excluded)
    const totalAvailable = Object.values(
        campground.siteAvailability ?? {},
    ).reduce((acc, site) => acc + (site.matches?.length ?? 0), 0);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {/* Row — clicking anywhere opens the drawer */}
            <div
                className={cn(
                    "group flex items-center gap-3 rounded-lg border bg-card p-3 transition-all",
                    "cursor-pointer hover:border-primary/30 hover:shadow-sm",
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
                    className="size-12 shrink-0 overflow-hidden rounded-md bg-muted bg-cover bg-center"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                    aria-hidden
                />

                {/* Name + area */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-base font-semibold leading-tight">
                            {campground.name}
                        </h3>
                        {totalAvailable === 0 ? (
                            <Badge
                                variant="secondary"
                                className="shrink-0 text-[10px]"
                            >
                                Nothing open
                            </Badge>
                        ) : (
                            <Badge className="shrink-0 bg-primary text-primary-foreground text-[10px]">
                                {totalAvailable} open
                            </Badge>
                        )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                        {campground.area ?? ""}
                    </p>
                </div>

                {/* Availability strip — hidden on mobile */}
                <div className="hidden flex-1 max-w-md md:block">
                    <AvailabilityStrip
                        campground={campground}
                        showExcluded={showExcluded}
                        siteRatings={siteRatings}
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
                    imageUrl={imageUrl}
                    siteRatings={siteRatings}
                    onRatingChange={onRatingChange}
                />
            </SheetContent>
        </Sheet>
    );
}
