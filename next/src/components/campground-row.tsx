"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AvailabilityStrip } from "@/components/availability-strip";
import { CampgroundDetail } from "@/components/campground-detail";
import { useCampgroundDetails } from "@/hooks/use-campground-details";
import { CampgroundThumbnail } from "@/components/campground/campground-thumbnail";
import { CampgroundNameLine } from "@/components/campground/campground-name-line";
import { OpenCountBadge } from "@/components/campground/open-count-badge";
import { FavoriteStar } from "@/components/campground/favorite-star";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import { DEFAULT_IMAGE } from "@/components/campground/get-image-url";
import type { SiteRatingsMap } from "@/components/availability-strip";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

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
    readOnly?: boolean;
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
    readOnly = false,
}: CampgroundRowProps) {
    const [open, setOpen] = useState(false);

    // When the local image is the generic fallback, try to use the
    // recreation.gov preview image fetched server-side and cached in KV.
    const isLocalDefault = imageUrl === DEFAULT_IMAGE;
    const details = useCampgroundDetails(isLocalDefault ? campground.id : undefined);
    const effectiveImageUrl =
        isLocalDefault && details?.previewImageUrl ? details.previewImageUrl : imageUrl;

    const isCompact = density === "compact";
    const totalAvailable = getCampgroundOpenCount(campground, windowStart, windowEnd);

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
                <CampgroundThumbnail
                    imageUrl={effectiveImageUrl}
                    size={isCompact ? "sm" : "md"}
                />

                {/* Name + area + open count */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <CampgroundNameLine
                            name={campground.name}
                            nameClassName={isCompact ? "text-sm" : "text-base"}
                        />
                        <OpenCountBadge
                            count={totalAvailable}
                            variant={isCompact ? "compact" : "default"}
                        />
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
                <FavoriteStar
                    isFavorite={isFavorite}
                    onToggle={onToggleFavorite}
                    hidden={readOnly}
                />

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
                    readOnly={readOnly}
                />
            </SheetContent>
        </Sheet>
    );
}
