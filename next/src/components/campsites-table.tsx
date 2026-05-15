"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Camera } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
    formatToMMDDYYYY,
    getDayOfWeek,
    getShortenedDayOfWeek,
    getSitesWithMatches,
    sortByFromDate,
    sortBySiteName,
    goToPage,
} from "@/lib/campground-utils";
import type { ProcessedCampground, SiteAvailability, StayMatch, ExcludedStay } from "@/types/campground";

interface CampsitesTableProps {
    data: SiteAvailability[];
    campground: ProcessedCampground;
    site: string;
    showExcluded: boolean;
}

interface CardEntry {
    site: SiteAvailability;
    match: StayMatch | ExcludedStay;
    key: string;
}

function openPhotoPreview(
    site: SiteAvailability,
    campground: ProcessedCampground,
    setPreview: (v: { open: boolean; photos: string[]; siteName: string }) => void,
) {
    const campgroundId = campground?.id;
    const siteNumber = site.siteName?.replace(/^Site\s+/i, "");
    const fallback = campground?.image
        ? `/images/sites/${campground.image}`
        : "/images/sites/bg_default.jpg";

    const sitePhotos: string[] = site.photos?.length
        ? site.photos
        : site.photo
            ? [site.photo]
            : [];
    const resolvedPhotos = sitePhotos.map((photo) => {
        if (photo.startsWith("http")) return photo;
        return photo.startsWith("/images/") ? photo : `/images/sites/${photo}`;
    });

    if (resolvedPhotos.length === 0 && campgroundId && siteNumber) {
        resolvedPhotos.push(`/images/sites/${campgroundId}/${siteNumber}.jpg`);
    }
    if (resolvedPhotos.length === 0) {
        resolvedPhotos.push(fallback);
    }

    setPreview({ open: true, photos: resolvedPhotos, siteName: site.siteName });
}

function CampsiteCard({
    match,
    site,
    campground,
    onPhotoClick,
}: {
    match: StayMatch | ExcludedStay;
    site: SiteAvailability;
    campground: ProcessedCampground;
    onPhotoClick: () => void;
}) {
    if (!match?.from) return null;
    const isExcluded = "excluded" in match && !!match.excluded;
    const dayOfWeek = getDayOfWeek(match.from, true, true);
    const shortDayOfWeek = getShortenedDayOfWeek(dayOfWeek);
    const excludedReason = isExcluded ? (match as ExcludedStay).reason : null;

    const reservationUrl = `https://www.recreation.gov/camping/campsites/${site.siteId}?arrivalDate=${match.from}&departureDate=${match.to}`;

    return (
        <Card
            className={
                isExcluded
                    ? "border-amber-500 border-2 opacity-75"
                    : "border"
            }
        >
            <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                            <CardTitle className="text-base">{site.siteName}</CardTitle>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        onClick={onPhotoClick}
                                        className="opacity-40 hover:opacity-100 transition-opacity p-0.5"
                                        aria-label="View photos"
                                    >
                                        <Camera className="size-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>View photos</TooltipContent>
                            </Tooltip>
                        </div>
                        <CardDescription>{site.loop ?? campground?.name}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <Badge variant={isExcluded ? "outline" : "default"} className={isExcluded ? "border-amber-500 text-amber-700" : ""}>
                            {match.nights} nights
                        </Badge>
                        <Badge variant="secondary">Arrives {shortDayOfWeek}</Badge>
                        {isExcluded && (
                            <Badge variant="outline" className="border-amber-500 text-amber-700">
                                {excludedReason === "stayLength" ? "Excluded: stay length" : "Excluded: start day"}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Separator className="mb-3" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-0.5">Arrival</div>
                        <div className="text-sm">{formatToMMDDYYYY(match.from)}</div>
                    </div>
                    <div>
                        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-0.5">Departure</div>
                        <div className="text-sm">{formatToMMDDYYYY(match.to)}</div>
                    </div>
                    <div>
                        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-0.5">Loop</div>
                        <div className="text-sm">{site.loop ?? "Primary"}</div>
                    </div>
                    <div>
                        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-0.5">Type</div>
                        <div className="text-sm">{site.campsite_type ?? "Standard"}</div>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(reservationUrl, "_blank", "noreferrer")}
                        >
                            Open Site
                            <ExternalLink className="ml-1 size-3.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>View site on Recreation.gov</TooltipContent>
                </Tooltip>
            </CardFooter>
        </Card>
    );
}

export function CampsitesTable({ data, campground, showExcluded }: CampsitesTableProps) {
    const [photoPreview, setPhotoPreview] = useState<{
        open: boolean;
        photos: string[];
        siteName: string;
    }>({ open: false, photos: [], siteName: "" });

    const cards = useMemo((): CardEntry[] | null => {
        if (!data || data.length === 0) return null;
        const sitesWithMatches = getSitesWithMatches(data);
        const sortedSites = sortBySiteName(sitesWithMatches);
        const result: CardEntry[] = [];

        sortedSites.forEach((site) => {
            sortByFromDate(site.matches).forEach((match) => {
                result.push({
                    site,
                    match,
                    key: `${site.siteName}-${match.from}-${match.to}`,
                });
            });
            if (showExcluded && site.excludedMatches?.length > 0) {
                sortByFromDate(site.excludedMatches).forEach((match) => {
                    result.push({
                        site,
                        match,
                        key: `${site.siteName}-excluded-${match.from}-${match.to}`,
                    });
                });
            }
        });

        if (showExcluded) {
            const sitesOnlyExcluded = data.filter(
                (s) => (!s.matches || s.matches.length === 0) && s.excludedMatches?.length > 0,
            );
            sortBySiteName(sitesOnlyExcluded).forEach((site) => {
                sortByFromDate(site.excludedMatches).forEach((match) => {
                    result.push({
                        site,
                        match,
                        key: `${site.siteName}-excluded-${match.from}-${match.to}`,
                    });
                });
            });
        }

        return result.length > 0 ? result : null;
    }, [data, showExcluded]);

    return (
        <>
            <div className="flex flex-col gap-3">
                {cards ? (
                    cards.map(({ site, match, key }) => (
                        <CampsiteCard
                            key={key}
                            site={site}
                            match={match}
                            campground={campground}
                            onPhotoClick={() =>
                                openPhotoPreview(site, campground, setPhotoPreview)
                            }
                        />
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No matching campsites were found.
                    </p>
                )}
            </div>

            <Dialog
                open={photoPreview.open}
                onOpenChange={(open) =>
                    !open && setPhotoPreview({ open: false, photos: [], siteName: "" })
                }
            >
                <DialogContent className="max-w-sm">
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
        </>
    );
}
