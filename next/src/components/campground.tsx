"use client";

import { useEffect, useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";

import {
    Card,
    CardContent,
    CardHeader,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { checkForAvailabilityInArray } from "@/lib/campground-utils";
import type { ProcessedCampground } from "@/types/campground";

import { CampsitesTable } from "./campsites-table";
import { CampsitesCalendarParent } from "./campsites-calendar-parent";

// ---------------------------------------------------------------------------
// localStorage helpers (match CRA keys exactly)
// ---------------------------------------------------------------------------

const SECTION_VIEWS_KEY = "campground-section-views";
const SECTION_EXPANDED_KEY = "campground-section-expanded";

const safeParse = <T>(value: string | null, fallback: T): T => {
    try {
        return value ? (JSON.parse(value) as T) : fallback;
    } catch {
        return fallback;
    }
};

const readMapFromStorage = (key: string): Record<string, unknown> => {
    if (typeof window === "undefined") return {};
    return safeParse(localStorage.getItem(key), {});
};

const writeMapToStorage = (key: string, value: unknown): void => {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
};

const getCampgroundStorageId = (campground: ProcessedCampground | null | undefined): string =>
    campground?.id ?? campground?.name ?? "";

// ---------------------------------------------------------------------------
// Initial state helpers
// ---------------------------------------------------------------------------

type SectionKey = string;
type ViewMode = "calendar" | "table";

function getInitialExpandedState(
    campground: ProcessedCampground | null | undefined,
): Record<SectionKey, boolean> {
    if (!campground?.sitesGroupedByFavorites) return {};
    const campgroundId = getCampgroundStorageId(campground);
    const storedExpandedMap = readMapFromStorage(SECTION_EXPANDED_KEY) as Record<
        string,
        Record<string, boolean>
    >;
    return Object.keys(campground.sitesGroupedByFavorites).reduce(
        (acc, key) => {
            const saved = storedExpandedMap[campgroundId]?.[key];
            const isHiddenBySetting = !campground.showOrHide?.[key as keyof typeof campground.showOrHide];
            acc[key] = isHiddenBySetting ? false : typeof saved === "boolean" ? saved : true;
            return acc;
        },
        {} as Record<SectionKey, boolean>,
    );
}

function getInitialSectionViews(
    campground: ProcessedCampground | null | undefined,
): Record<SectionKey, ViewMode> {
    if (!campground) return {};
    const campgroundId = getCampgroundStorageId(campground);
    const storedViewsMap = readMapFromStorage(SECTION_VIEWS_KEY) as Record<
        string,
        Record<string, ViewMode>
    >;
    return (storedViewsMap[campgroundId] as Record<SectionKey, ViewMode>) ?? {};
}

// ---------------------------------------------------------------------------
// Campground component
// ---------------------------------------------------------------------------

interface CampgroundProps {
    campground: ProcessedCampground;
    viewMode?: ViewMode;
    showExcluded?: boolean;
}

function getMatchCount(sites: ReturnType<typeof Object.values>[number]): number {
    if (!Array.isArray(sites)) return 0;
    return sites.reduce(
        (acc: number, site: { matches?: unknown[] }) => acc + (site.matches?.length ?? 0),
        0,
    );
}

export function Campground({
    campground: campgroundProp,
    viewMode,
    showExcluded = false,
}: CampgroundProps) {
    // Initialise synchronously to avoid a flash of wrong state
    const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>(
        () => getInitialExpandedState(campgroundProp),
    );
    const [sectionViews, setSectionViews] = useState<Record<SectionKey, ViewMode>>(
        () => getInitialSectionViews(campgroundProp),
    );

    // Re-sync when the campground changes
    useEffect(() => {
        setExpandedSections(getInitialExpandedState(campgroundProp));
        setSectionViews(getInitialSectionViews(campgroundProp));
    }, [campgroundProp]);

    // The global effective view: prop overrides settings default
    const effectiveView = useMemo<ViewMode>(
        () => viewMode ?? "calendar",
        [viewMode],
    );

    // Per-section view overrides only apply in calendar mode
    const overridesEnabled = effectiveView === "calendar";

    // Persist expanded state
    useEffect(() => {
        const storageId = getCampgroundStorageId(campgroundProp);
        if (!storageId || Object.keys(expandedSections).length === 0) return;
        const stored = readMapFromStorage(SECTION_EXPANDED_KEY) as Record<
            string,
            Record<string, boolean>
        >;
        stored[storageId] = expandedSections;
        writeMapToStorage(SECTION_EXPANDED_KEY, stored);
    }, [expandedSections, campgroundProp]);

    // Persist section view overrides
    useEffect(() => {
        const storageId = getCampgroundStorageId(campgroundProp);
        if (!storageId) return;
        const stored = readMapFromStorage(SECTION_VIEWS_KEY) as Record<
            string,
            Record<string, ViewMode>
        >;
        if (Object.keys(sectionViews).length === 0) {
            delete stored[storageId];
        } else {
            stored[storageId] = sectionViews;
        }
        writeMapToStorage(SECTION_VIEWS_KEY, stored);
    }, [sectionViews, campgroundProp]);

    const toggleSection = (type: SectionKey) => () => {
        setExpandedSections((prev) => ({ ...prev, [type]: !prev[type] }));
    };

    const handleSectionViewChange = (type: SectionKey, nextView: string) => {
        if (!nextView) return;
        setSectionViews((prev) => ({ ...prev, [type]: nextView as ViewMode }));
    };

    if (!campgroundProp?.sitesGroupedByFavorites) return null;

    return (
        <div className="flex flex-col gap-3">
            {Object.keys(campgroundProp.sitesGroupedByFavorites).map((type, typeIndex) => {
                const group =
                    campgroundProp.sitesGroupedByFavorites![
                        type as keyof typeof campgroundProp.sitesGroupedByFavorites
                    ];
                const hasPreferenceAvailability = checkForAvailabilityInArray(group);
                const hasExcludedAvailability =
                    showExcluded && group.some((site) => site.excludedMatches?.length > 0);

                if (!hasPreferenceAvailability && !hasExcludedAvailability) return null;

                const isHiddenBySetting =
                    !campgroundProp.showOrHide?.[type as keyof typeof campgroundProp.showOrHide];
                const matchCount = getMatchCount(group);

                const expanded = hasExcludedAvailability
                    ? true
                    : isHiddenBySetting
                        ? (expandedSections[type] ?? false)
                        : (expandedSections[type] ?? hasPreferenceAvailability);

                const sectionView: ViewMode = overridesEnabled
                    ? (sectionViews[type] ?? effectiveView)
                    : effectiveView;

                return (
                    <Card key={campgroundProp.name + typeIndex} className="overflow-hidden">
                        {/* Section header */}
                        <CardHeader className="pb-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                {/* Title + chips */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-semibold">{type}</span>
                                    <Badge variant="outline" className="border-primary text-primary">
                                        {matchCount} stays available
                                    </Badge>
                                    {isHiddenBySetting && (
                                        <Badge
                                            variant="outline"
                                            className="opacity-70 text-xs"
                                        >
                                            Hidden by settings
                                        </Badge>
                                    )}
                                </div>

                                {/* View toggle + expand/collapse */}
                                <div className="flex items-center gap-2">
                                    {overridesEnabled ? (
                                        <Tabs
                                            value={sectionView}
                                            onValueChange={(v) =>
                                                handleSectionViewChange(type, v)
                                            }
                                        >
                                            <TabsList className="h-7">
                                                <TabsTrigger value="calendar" className="text-xs px-2 py-0.5">
                                                    Calendar
                                                </TabsTrigger>
                                                <TabsTrigger value="table" className="text-xs px-2 py-0.5">
                                                    Table
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    ) : (
                                        <Badge variant="outline" className="text-xs">
                                            View: {effectiveView}
                                        </Badge>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={toggleSection(type)}
                                                aria-label={`Toggle ${type}`}
                                                className="size-7 p-0"
                                            >
                                                <ChevronDown
                                                    className={cn(
                                                        "size-4 transition-transform duration-200",
                                                        expanded ? "rotate-0" : "-rotate-90",
                                                    )}
                                                />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {expanded ? "Collapse" : "Expand"}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Collapsible body */}
                        {expanded && (
                            <CardContent className="pt-1.5">
                                {!group || group.length === 0 ? (
                                    <div className="flex flex-col gap-2">
                                        <Skeleton className="h-12 w-full" />
                                        <Skeleton className="h-48 w-full" />
                                    </div>
                                ) : sectionView === "table" ? (
                                    <CampsitesTable
                                        key={`${campgroundProp.name}-${typeIndex}-table`}
                                        data={group}
                                        site={type}
                                        campground={campgroundProp}
                                        showExcluded={showExcluded}
                                    />
                                ) : (
                                    <CampsitesCalendarParent
                                        key={`${campgroundProp.name}-${typeIndex}-calendar`}
                                        data={group}
                                        type={type}
                                        campground={campgroundProp}
                                        showExcluded={showExcluded}
                                    />
                                )}
                            </CardContent>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}
