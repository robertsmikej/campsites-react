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
    single: "rounded-full bg-emerald-600 text-white hover:bg-emerald-700",
    rangeStart: "rounded-l-full bg-emerald-600 text-white hover:bg-emerald-700",
    rangeMiddle: "rounded-none bg-emerald-600 text-white hover:bg-emerald-700",
    rangeEnd:
        "rounded-r-full bg-emerald-600 text-white bg-gradient-to-br from-emerald-600 from-65% to-transparent to-65% hover:from-emerald-700",
    softSingle: "rounded-full bg-emerald-200 text-emerald-900 hover:bg-emerald-300",
    softRangeStart: "rounded-l-full bg-emerald-200 text-emerald-900 hover:bg-emerald-300",
    softRangeMiddle: "rounded-none bg-emerald-200 text-emerald-900 hover:bg-emerald-300",
    softRangeEnd:
        "rounded-r-full bg-emerald-200 text-emerald-900 bg-gradient-to-br from-emerald-200 from-65% to-transparent to-65% hover:from-emerald-300",
    excludedSingle: "rounded-full bg-orange-500 text-white hover:bg-orange-600",
    excludedRangeStart: "rounded-l-full bg-orange-500 text-white hover:bg-orange-600",
    excludedRangeMiddle: "rounded-none bg-orange-500 text-white hover:bg-orange-600",
    excludedRangeEnd:
        "rounded-r-full bg-orange-500 text-white bg-gradient-to-br from-orange-500 from-65% to-transparent to-65% hover:from-orange-600",
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
                    const monthDate = new Date(monthIso + "T00:00:00Z");

                    return (
                        <Calendar
                            key={monthIso}
                            mode="single"
                            defaultMonth={monthDate}
                            className="rounded-lg border p-2"
                            onSelect={(date) => {
                                if (date) goToPage(site, monthIso);
                            }}
                            components={{
                                DayButton: (props: DayButtonProps) => {
                                    const { day, modifiers, ...rest } = props;
                                    const key = formatDateKey(day.date);
                                    const variant = variantMap.get(key);
                                    return (
                                        <button
                                            {...rest}
                                            className={cn(
                                                "size-8 text-sm",
                                                variant
                                                    ? VARIANT_CLASS[variant]
                                                    : "hover:bg-muted",
                                            )}
                                        >
                                            {day.date.getUTCDate()}
                                        </button>
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
