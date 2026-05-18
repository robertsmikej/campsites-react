"use client";

import { useMemo, useState } from "react";
import type { DayButtonProps } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { goToPage } from "@/lib/campground-utils";
import type { SiteAvailability, ProcessedCampground } from "@/types/campground";
import {
    type DayVariant,
    buildDateDisplayArray,
    buildVariantMap,
    getMonthsFromSiteData,
} from "./campsites-calendar-helpers";

// ---------------------------------------------------------------------------
// Variant → Tailwind class map
// ---------------------------------------------------------------------------

const VARIANT_CLASS: Record<DayVariant, string> = {
    // Hard match — solid forest pill
    single: "rounded-full bg-primary text-primary-foreground transition-colors duration-150 hover:opacity-90",
    rangeStart: "rounded-l-full bg-primary text-primary-foreground transition-colors duration-150 hover:opacity-90",
    rangeMiddle: "rounded-none bg-primary text-primary-foreground transition-colors duration-150 hover:opacity-90",
    rangeEnd:
        "rounded-r-full bg-primary text-primary-foreground bg-gradient-to-br from-primary from-65% to-transparent to-65% transition-colors duration-150 hover:opacity-90",

    // Soft / single-day availability — muted forest
    softSingle: "rounded-full bg-primary/20 text-primary transition-colors duration-150 hover:bg-primary/30",
    softRangeStart: "rounded-l-full bg-primary/20 text-primary transition-colors duration-150 hover:bg-primary/30",
    softRangeMiddle: "rounded-none bg-primary/20 text-primary transition-colors duration-150 hover:bg-primary/30",
    softRangeEnd:
        "rounded-r-full bg-primary/20 text-primary bg-gradient-to-br from-primary/20 from-65% to-transparent to-65% transition-colors duration-150 hover:bg-primary/30",

    // Excluded — warm rust
    excludedSingle: "rounded-full bg-accent text-accent-foreground transition-colors duration-150 hover:opacity-90",
    excludedRangeStart: "rounded-l-full bg-accent text-accent-foreground transition-colors duration-150 hover:opacity-90",
    excludedRangeMiddle: "rounded-none bg-accent text-accent-foreground transition-colors duration-150 hover:opacity-90",
    excludedRangeEnd:
        "rounded-r-full bg-accent text-accent-foreground bg-gradient-to-br from-accent from-65% to-transparent to-65% transition-colors duration-150 hover:opacity-90",
};

// ---------------------------------------------------------------------------
// Date key helper — uses UTC to avoid timezone shifts
// ---------------------------------------------------------------------------

function formatDateKey(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CampsitesCalendarProps {
    site: SiteAvailability;
    campground: ProcessedCampground;
    showExcluded: boolean;
}

export function CampsitesCalendar({ site, campground, showExcluded }: CampsitesCalendarProps) {
    const [photoPreview, setPhotoPreview] = useState<{
        open: boolean;
        photos: string[];
        siteName: string;
    }>({ open: false, photos: [], siteName: "" });

    const values = useMemo(() => buildDateDisplayArray(site, showExcluded), [site, showExcluded]);
    const variantMap = useMemo(() => buildVariantMap(values), [values]);
    const months = useMemo(() => getMonthsFromSiteData(site, showExcluded), [site, showExcluded]);

    const openPhotos = () => {
        const fallback = campground.image
            ? `/images/sites/${campground.image}`
            : "/images/sites/bg_default.jpg";
        const photos = site.photos?.length
            ? site.photos
            : site.photo
                ? [site.photo]
                : [fallback];
        const resolved = photos.map((photo) => {
            if (photo.startsWith("http")) return photo;
            return photo.startsWith("/images/") ? photo : `/images/sites/${photo}`;
        });
        setPhotoPreview({ open: true, photos: resolved, siteName: site.siteName });
    };

    return (
        <div className="space-y-3 p-3">
            {/* Site metadata chips */}
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{site.campsite_type ?? "Standard"}</Badge>
                {site.max_num_people ? (
                    <Badge variant="outline">Up to {site.max_num_people} people</Badge>
                ) : null}
                {site.max_vehicle_length ? (
                    <Badge variant="outline">Vehicle {site.max_vehicle_length} ft</Badge>
                ) : null}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={openPhotos}>
                            <ImageIcon className="mr-1 size-4" />
                            Photos
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preview campsite photos</TooltipContent>
                </Tooltip>
            </div>

            {/* One mini-calendar per month with data */}
            <div className="flex flex-wrap gap-2">
                {months.map((monthIso) => {
                    // Use the month ISO string as-is for goToPage
                    const [yearStr, monthStr] = monthIso.split("-");
                    const monthDate = new Date(Number(yearStr), Number(monthStr) - 1, 15);

                    return (
                        <Calendar
                            key={monthIso}
                            mode="single"
                            defaultMonth={monthDate}
                            className="rounded-xl border bg-card p-2 shadow-sm"
                            onSelect={(date) => {
                                if (date) goToPage(site, monthIso);
                            }}
                            components={{
                                DayButton: (props: DayButtonProps) => {
                                    const { day, modifiers: _modifiers, ...rest } = props;
                                    const key = formatDateKey(day.date);
                                    const variant = variantMap.get(key);
                                    const button = (
                                        <button
                                            {...rest}
                                            className={cn(
                                                "size-8 text-sm transition-colors duration-150",
                                                variant
                                                    ? VARIANT_CLASS[variant]
                                                    : "rounded-md hover:bg-muted",
                                            )}
                                        >
                                            {day.date.getUTCDate()}
                                        </button>
                                    );
                                    if (!variant) return button;

                                    const label = variant.startsWith("excluded")
                                        ? "Filtered out — site is open but doesn't fit your filters"
                                        : variant.startsWith("soft")
                                        ? "Single day available"
                                        : "Available";

                                    return (
                                        <Tooltip>
                                            <TooltipTrigger asChild>{button}</TooltipTrigger>
                                            <TooltipContent>
                                                {day.date.toLocaleDateString("en-US", {
                                                    weekday: "short",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                                : {label}
                                            </TooltipContent>
                                        </Tooltip>
                                    );
                                },
                            }}
                        />
                    );
                })}
            </div>

            {/* Photo preview dialog */}
            <Dialog
                open={photoPreview.open}
                onOpenChange={(open) =>
                    !open && setPhotoPreview({ open: false, photos: [], siteName: "" })
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{photoPreview.siteName}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        {photoPreview.photos.map((photo, index) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={photo + index}
                                src={photo}
                                alt={`Campsite photo ${index + 1}`}
                                loading="lazy"
                                className="w-full rounded-lg border"
                            />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
