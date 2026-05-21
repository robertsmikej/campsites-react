"use client";

import { useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";
import { CampsitesCalendar } from "./campsites-calendar";

interface CampsitesCalendarParentProps {
    data: SiteAvailability[];
    campground: ProcessedCampground;
    type: string;
    showExcluded: boolean;
}

export function CampsitesCalendarParent({ data, campground, showExcluded }: CampsitesCalendarParentProps) {
    // Mirror CRA: only show sites with matches, startDay-excluded, or
    // (when toggled) any excluded matches.
    const visibleSites = useMemo(() => {
        return data.filter(
            (site) =>
                site.matches?.length > 0 ||
                site.excludedMatches?.some((m) => m.reason === "startDay") ||
                (showExcluded && site.excludedMatches?.length > 0),
        );
    }, [data, showExcluded]);

    // Default-expand sites that have real matches; collapse-only-startDay sites
    const defaultExpanded = useMemo(() => {
        return visibleSites.filter((site) => site.matches?.length > 0).map((site) => site.siteId);
    }, [visibleSites]);

    return (
        <Accordion type="multiple" defaultValue={defaultExpanded} className="space-y-2">
            {visibleSites.map((site, siteIndex) => {
                const hasMatches = (site.matches?.length ?? 0) > 0;
                return (
                    <AccordionItem
                        key={site.siteId + siteIndex}
                        value={site.siteId}
                        className="rounded-lg border overflow-hidden"
                    >
                        <AccordionTrigger className="px-3 py-2 hover:no-underline">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between w-full mr-2">
                                <div className="flex flex-col gap-0.5 text-left">
                                    <span className="text-sm font-medium">Site: {site.siteName}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {site.loop ?? "Primary loop"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    {!hasMatches && (
                                        <Badge variant="outline" className="text-xs">
                                            No matching days
                                        </Badge>
                                    )}
                                    {hasMatches && (
                                        <Badge
                                            variant="outline"
                                            className="text-xs border-emerald-500 text-emerald-700"
                                        >
                                            {site.matches.length} match
                                            {site.matches.length === 1 ? "" : "es"}
                                        </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                        {site.campsite_type ?? "Standard"}
                                    </Badge>
                                    {site.max_num_people ? (
                                        <Badge variant="outline" className="text-xs">
                                            Up to {site.max_num_people} people
                                        </Badge>
                                    ) : null}
                                    {site.max_vehicle_length ? (
                                        <Badge variant="outline" className="text-xs">
                                            Vehicle {site.max_vehicle_length} ft
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                            <CampsitesCalendar
                                site={site}
                                campground={campground}
                                showExcluded={showExcluded}
                            />
                            {showExcluded && site.excludedMatches?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                                    {site.excludedMatches.map((m, i) => (
                                        <Badge
                                            key={i}
                                            variant="outline"
                                            className="text-xs border-amber-500 text-amber-700"
                                        >
                                            {m.from} &rarr; {m.nights}n (
                                            {m.reason === "stayLength" ? "stay too short" : "wrong start day"}
                                            )
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}
