"use client";

import { useState } from "react";
import { ChevronRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AvailabilityStrip } from "@/components/availability-strip";
import { CampsitesCalendar } from "@/components/campsites-calendar";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

type SiteRating = "favorite" | "worthwhile" | "unrated";

interface SiteRowProps {
    site: SiteAvailability;
    campground: ProcessedCampground;
    showExcluded: boolean;
    defaultOpen?: boolean;
    rating?: SiteRating;
    onRatingChange?: (newRating: SiteRating) => void;
    readOnly?: boolean;
}

const RATING_CYCLE: Record<SiteRating, SiteRating> = {
    unrated: "worthwhile",
    worthwhile: "favorite",
    favorite: "unrated",
};

export function SiteRow({
    site,
    campground,
    showExcluded,
    defaultOpen = false,
    rating = "unrated",
    onRatingChange,
    readOnly = false,
}: SiteRowProps) {
    const [open, setOpen] = useState(defaultOpen);

    // Count total available days by summing nights across all StayMatch entries.
    // Each StayMatch.nights is the length of that stay, so summing gives total
    // days of availability. Fall back to walking [from, to) if nights is absent.
    const availableDays =
        site.matches?.reduce((acc, m) => {
            if (typeof m.nights === "number") return acc + m.nights;
            // Defensive fallback: derive from dates
            const from = new Date(m.from + "T00:00:00");
            const to = new Date(m.to + "T00:00:00");
            return acc + Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
        }, 0) ?? 0;

    return (
        <div className={cn("rounded-md border bg-card transition-shadow", open && "shadow-sm")}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    "flex w-full items-center gap-3 rounded-md p-2.5 text-left transition-colors",
                    "hover:bg-muted/50",
                )}
                aria-expanded={open}
            >
                <ChevronRight
                    className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-90",
                    )}
                />
                <div className="min-w-0 flex-shrink-0 basis-32">
                    <p className="truncate text-sm font-medium">{site.siteName}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                        {site.campsite_type ?? "Standard"}
                    </p>
                </div>
                {/* Rating cycle button — hidden in readOnly mode */}
                {!readOnly && onRatingChange ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRatingChange(RATING_CYCLE[rating]);
                        }}
                        aria-label={`Site rating: ${rating}. Click to change.`}
                        className="shrink-0 rounded p-0.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        {rating === "favorite" ? (
                            <Star
                                className="size-4"
                                style={{ color: "oklch(0.55 0.15 145)", fill: "oklch(0.55 0.15 145)" }}
                            />
                        ) : rating === "worthwhile" ? (
                            <Star
                                className="size-4"
                                style={{ color: "oklch(0.78 0.16 80)", fill: "oklch(0.78 0.16 80)" }}
                            />
                        ) : (
                            <Star className="size-4 text-muted-foreground" />
                        )}
                    </button>
                ) : null}
                {availableDays > 0 ? (
                    <Badge className="shrink-0 bg-primary text-primary-foreground text-[12px]">
                        {availableDays}n
                    </Badge>
                ) : (
                    <Badge variant="secondary" className="shrink-0 text-[12px]">
                        —
                    </Badge>
                )}
                <div className="hidden flex-1 min-w-0 sm:block">
                    <AvailabilityStrip site={site} showExcluded={showExcluded} />
                </div>
            </button>
            {open ? (
                <div className="border-t bg-muted/20 p-2">
                    <CampsitesCalendar site={site} campground={campground} showExcluded={showExcluded} />
                </div>
            ) : null}
        </div>
    );
}
