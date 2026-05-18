"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    Calendar,
    Table2,
    ExternalLink,
    ChevronDown,
    Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { checkForGroupedAvailability } from "@/lib/campground-utils";
import { getTypeBadge } from "@/components/campground/type-badge";
import type { ProcessedCampground } from "@/types/campground";

import { Campground } from "./campground";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW_MODE_STORAGE_KEY = "campgrounds-view-mode";
const EXPANDED_GROUPS_STORAGE_KEY = "campgrounds-expanded-groups";
const ALL_CAMPGROUNDS_KEY = "all-campgrounds";

type ViewMode = "calendar" | "table";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const safeParse = <T,>(value: string | null, fallback: T): T => {
    try {
        return value ? (JSON.parse(value) as T) : fallback;
    } catch {
        return fallback;
    }
};

const readObjectFromStorage = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    return safeParse(localStorage.getItem(key), fallback);
};

const writeObjectToStorage = (key: string, value: unknown): void => {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCampgroundId(campground: ProcessedCampground): string {
    return campground?.id ?? campground?.name ?? `${campground?.area ?? "camp"}-${campground?.description ?? ""}`;
}

function getCampgroundUrl(campground: ProcessedCampground): string {
    return `https://www.recreation.gov/camping/campgrounds/${campground.id}`;
}

function getImageUrl(image: string | null | undefined): string {
    if (!image) return "/images/sites/bg_default.jpg";
    if (image.startsWith("http")) return image;
    return `/images/sites/${image}`;
}

interface CampgroundStats {
    totalMatches: number;
    favoriteMatches: number;
    totalExcluded: number;
}

function getCampgroundStats(campground: ProcessedCampground): CampgroundStats {
    const grouped = campground.sitesGroupedByFavorites ?? ({} as NonNullable<typeof campground.sitesGroupedByFavorites>);
    let totalMatches = 0;
    let favoriteMatches = 0;
    let totalExcluded = 0;
    (Object.entries(grouped) as [string, ProcessedCampground["sitesGroupedByFavorites"] extends Record<string, infer V> ? V : never][]).forEach(
        ([label, sites]) => {
            if (!Array.isArray(sites)) return;
            (sites as Array<{ matches?: unknown[]; excludedMatches?: unknown[] }>).forEach((site) => {
                const matches = site.matches ?? [];
                totalMatches += matches.length;
                if (label === "Favorites") {
                    favoriteMatches += matches.length;
                }
                totalExcluded += site.excludedMatches?.length ?? 0;
            });
        },
    );
    return { totalMatches, favoriteMatches, totalExcluded };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CampgroundsGroupsProps {
    isLoading?: boolean;
    campgrounds: ProcessedCampground[] | Record<string, ProcessedCampground[]>;
    settings?: { views?: { type?: ViewMode } };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampgroundsGroups({ isLoading = false, campgrounds: campgroundsProp, settings }: CampgroundsGroupsProps) {
    // ---- view mode ----
    const storedViewRef = useRef<ViewMode | null>(readObjectFromStorage<ViewMode | null>(VIEW_MODE_STORAGE_KEY, null));
    const shouldSkipSettingsOverrideRef = useRef(storedViewRef.current !== null);

    const [viewMode, setViewMode] = useState<ViewMode>(
        () => storedViewRef.current ?? settings?.views?.type ?? "calendar",
    );

    // ---- campgrounds (flattened) ----
    const flattenedCampgrounds = useMemo<ProcessedCampground[]>(() => {
        if (Array.isArray(campgroundsProp)) {
            return campgroundsProp.filter(Boolean) as ProcessedCampground[];
        }
        return Object.values(campgroundsProp ?? {}).flat();
    }, [campgroundsProp]);

    // ---- expanded state ----
    const [expandedCampgrounds, setExpandedCampgrounds] = useState<Record<string, string[]>>(
        () => readObjectFromStorage(EXPANDED_GROUPS_STORAGE_KEY, {}),
    );

    // ---- image preview ----
    const [imagePreview, setImagePreview] = useState<{ open: boolean; src: string; alt: string }>(
        { open: false, src: "", alt: "" },
    );

    // ---- per-campground showExcluded ----
    const [showExcludedMap, setShowExcludedMap] = useState<Record<string, boolean>>({});

    // ---- sync settings.views.type when it changes ----
    useEffect(() => {
        if (!settings?.views?.type) return;
        if (shouldSkipSettingsOverrideRef.current) {
            shouldSkipSettingsOverrideRef.current = false;
            return;
        }
        setViewMode(settings.views.type);
    }, [settings?.views?.type]);

    // ---- default-expand campgrounds with availability on first load ----
    useEffect(() => {
        setExpandedCampgrounds((prev) => {
            const next = { ...prev };
            const availableIds = flattenedCampgrounds
                .map((cg) => (checkForGroupedAvailability(cg) ? getCampgroundId(cg) : null))
                .filter((id): id is string => id !== null);

            const existing = next[ALL_CAMPGROUNDS_KEY];
            if (!Array.isArray(existing) || existing.length === 0) {
                next[ALL_CAMPGROUNDS_KEY] = availableIds;
            } else {
                const cleaned = existing.filter((id) => availableIds.includes(id));
                availableIds.forEach((id) => {
                    if (!cleaned.includes(id)) cleaned.push(id);
                });
                next[ALL_CAMPGROUNDS_KEY] = cleaned;
            }
            return next;
        });
    }, [flattenedCampgrounds]);

    // ---- persist view mode ----
    useEffect(() => {
        writeObjectToStorage(VIEW_MODE_STORAGE_KEY, viewMode);
    }, [viewMode]);

    // ---- persist expanded state ----
    useEffect(() => {
        writeObjectToStorage(EXPANDED_GROUPS_STORAGE_KEY, expandedCampgrounds);
    }, [expandedCampgrounds]);

    // ---- handlers ----

    const handleViewModeChange = (nextView: string) => {
        if (!nextView) return;
        shouldSkipSettingsOverrideRef.current = false;
        storedViewRef.current = nextView as ViewMode;
        setViewMode(nextView as ViewMode);
    };

    const isCampgroundExpanded = useCallback(
        (groupKey: string, campgroundId: string, defaultExpanded = true): boolean => {
            const expandedList = expandedCampgrounds[groupKey];
            if (!expandedList) return defaultExpanded;
            return expandedList.includes(campgroundId);
        },
        [expandedCampgrounds],
    );

    const toggleCampground = useCallback(
        (groupKey: string, campgroundId: string) => () => {
            setExpandedCampgrounds((prev) => {
                const current = new Set(prev[groupKey] ?? []);
                if (current.has(campgroundId)) {
                    current.delete(campgroundId);
                } else {
                    current.add(campgroundId);
                }
                return { ...prev, [groupKey]: Array.from(current) };
            });
        },
        [],
    );

    const expandAllForGroup = (groupKey: string, campgroundsList: ProcessedCampground[]) => {
        const ids = campgroundsList
            .map((cg) => (checkForGroupedAvailability(cg) ? getCampgroundId(cg) : null))
            .filter((id): id is string => id !== null);
        setExpandedCampgrounds((prev) => ({ ...prev, [groupKey]: ids }));
    };

    const collapseAllForGroup = (groupKey: string) => {
        setExpandedCampgrounds((prev) => ({ ...prev, [groupKey]: [] }));
    };

    const handleImageOpen = (src: string, alt: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        setImagePreview({ open: true, src, alt });
    };

    const handleImageClose = () => setImagePreview({ open: false, src: "", alt: "" });

    const toggleShowExcluded = useCallback(
        (campgroundId: string) => (event: React.MouseEvent) => {
            event.stopPropagation();
            const turningOn = !showExcludedMap[campgroundId];
            setShowExcludedMap((prev) => ({ ...prev, [campgroundId]: turningOn }));
            if (turningOn) {
                setExpandedCampgrounds((prev) => {
                    const current = new Set(prev[ALL_CAMPGROUNDS_KEY] ?? []);
                    current.add(campgroundId);
                    return { ...prev, [ALL_CAMPGROUNDS_KEY]: Array.from(current) };
                });
            }
        },
        [showExcludedMap],
    );

    // ---- derived ----
    const availableCampgroundCount = flattenedCampgrounds.filter(checkForGroupedAvailability).length;

    // ---- per-campground card renderer ----
    const renderCampgroundCard = useCallback(
        (campground: ProcessedCampground, campgroundIndex: number) => {
            const hasCampgroundAvailability = checkForGroupedAvailability(campground);
            const stats = getCampgroundStats(campground);
            const campgroundId = getCampgroundId(campground);
            const showingExcluded = !!showExcludedMap[campgroundId];
            const hasExcludedData = showingExcluded && stats.totalExcluded > 0;
            const isExpandable = hasCampgroundAvailability || hasExcludedData;
            const expanded =
                isExpandable && isCampgroundExpanded(ALL_CAMPGROUNDS_KEY, campgroundId, isExpandable);

            const badge = getTypeBadge(campground);
            const TypeIcon = badge.Icon;
            const imageUrl = getImageUrl(campground.image);

            return (
                <div key={`${campground.name}-${campgroundIndex}`}>
                    {/* Accordion card */}
                    <div
                        className={cn(
                            "overflow-hidden rounded-lg border transition-shadow hover:shadow-md",
                            !isExpandable && "opacity-90",
                        )}
                    >
                        {/* Sticky header */}
                        <div
                            className={cn(
                                "sticky z-[2] cursor-pointer select-none bg-background",
                                expanded ? "rounded-b-none border-b" : "",
                                !isExpandable && "cursor-default",
                            )}
                            style={{ top: "112px" }}
                            onClick={isExpandable ? toggleCampground(ALL_CAMPGROUNDS_KEY, campgroundId) : undefined}
                        >
                            {/* Hero image banner */}
                            <div className="relative aspect-[5/1] w-full overflow-hidden bg-muted">
                                <img
                                    src={imageUrl}
                                    alt=""
                                    aria-hidden
                                    loading="lazy"
                                    onClick={(e) => { e.stopPropagation(); handleImageOpen(imageUrl, campground.name)(e); }}
                                    className="absolute inset-0 size-full cursor-pointer object-cover object-center"
                                />
                                {/* gradient overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/5" />

                                {/* type badge top-right with backdrop blur */}
                                <div className="absolute right-3 top-3">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium backdrop-blur-md">
                                        <TypeIcon className="size-3.5 shrink-0" style={{ color: badge.color }} aria-hidden />
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
                                            <p className="truncate text-xs text-white/85">{campground.area}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <a
                                                    href={getCampgroundUrl(campground)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex text-white/80 hover:text-white"
                                                >
                                                    <ExternalLink className="size-3.5" />
                                                </a>
                                            </TooltipTrigger>
                                            <TooltipContent>View on recreation.gov</TooltipContent>
                                        </Tooltip>
                                        {isExpandable && (
                                            <ChevronDown
                                                className={cn(
                                                    "size-4 shrink-0 text-white/80 transition-transform duration-200",
                                                    expanded ? "rotate-180" : "rotate-0",
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Stats row below the image */}
                            <div className="flex flex-col gap-1.5 px-3 py-2.5">
                                {/* ID + description */}
                                <span className="text-[0.65rem] leading-tight tracking-wide text-muted-foreground">
                                    ID: {campground.id}
                                </span>
                                {campground.description && (
                                    <p className="text-sm text-muted-foreground">{campground.description}</p>
                                )}

                                {/* Status + notifyAll */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {!hasCampgroundAvailability ? (
                                        <Badge variant="secondary" className="shrink-0 text-muted-foreground">
                                            No availability
                                        </Badge>
                                    ) : null}
                                    {campground.notifyAll && (
                                        <Badge variant="outline" className="shrink-0 border-blue-400 text-blue-600">
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
                                            variant={showExcludedMap[campgroundId] ? "default" : "outline"}
                                            className={cn(
                                                "cursor-pointer",
                                                showExcludedMap[campgroundId]
                                                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                                                    : "border-accent/50 text-accent hover:bg-accent/10",
                                            )}
                                            onClick={toggleShowExcluded(campgroundId)}
                                        >
                                            {showExcludedMap[campgroundId]
                                                ? `Hide ${stats.totalExcluded} excluded`
                                                : `Show ${stats.totalExcluded} excluded`}
                                        </Badge>
                                    )}
                                    {campground.validStartDays &&
                                        campground.validStartDays.length < 7 && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Badge variant="outline" className="text-[0.7rem]">
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
                                                <Badge variant="outline" className="text-[0.7rem]">
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
                            </div>
                        </div>

                        {/* Expandable body */}
                        {expanded && (
                            <div className="px-3 pt-3 pb-3">
                                <Campground
                                    key={`${campground.name}-${viewMode}-${!!showExcludedMap[campgroundId]}`}
                                    campground={campground}
                                    viewMode={viewMode}
                                    showExcluded={!!showExcludedMap[campgroundId]}
                                />
                            </div>
                        )}
                    </div>
                </div>
            );
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [flattenedCampgrounds, expandedCampgrounds, showExcludedMap, viewMode, isCampgroundExpanded, toggleCampground, toggleShowExcluded],
    );

    // ---- render ----

    return (
        <div className="flex flex-col gap-6">
            {/* Top control row: view mode toggle */}
            <div className="flex justify-end">
                <Tabs value={viewMode} onValueChange={handleViewModeChange}>
                    <TabsList className="h-8">
                        <TabsTrigger value="calendar" className="flex items-center gap-1 px-2.5 text-xs">
                            <Calendar className="size-3.5" />
                            Calendar
                        </TabsTrigger>
                        <TabsTrigger value="table" className="flex items-center gap-1 px-2.5 text-xs">
                            <Table2 className="size-3.5" />
                            Table
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Main content */}
            {flattenedCampgrounds.length === 0 ? (
                <div className="rounded-xl border p-6">
                    {isLoading ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <Loader2 className="size-5 animate-spin" />
                                <span className="text-sm">Loading campgrounds...</span>
                            </div>
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-20 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No campgrounds configured yet.</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-4 rounded-xl border p-4 md:p-6">
                    {/* Header: title + count chips + expand/collapse */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold">Campgrounds</h3>
                                {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline">
                                    Total Checked: {flattenedCampgrounds.length}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        availableCampgroundCount > 0
                                            ? "border-green-500 text-green-700"
                                            : "",
                                    )}
                                >
                                    With Availability: {availableCampgroundCount}
                                </Badge>
                            </div>
                        </div>
                        {viewMode === "calendar" && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => expandAllForGroup(ALL_CAMPGROUNDS_KEY, flattenedCampgrounds)}
                                >
                                    Expand all
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => collapseAllForGroup(ALL_CAMPGROUNDS_KEY)}
                                >
                                    Collapse all
                                </Button>
                            </div>
                        )}
                    </div>

                    <hr className="border-border" />

                    {/* Calendar legend */}
                    {viewMode === "calendar" && (
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <span className="size-3 rounded-full bg-green-600" />
                                <span className="text-xs text-muted-foreground">Matches filters</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="size-3 rounded-full bg-green-200" />
                                <span className="text-xs text-muted-foreground">
                                    Available (wrong start day)
                                </span>
                            </div>
                            {Object.values(showExcludedMap).some(Boolean) && (
                                <div className="flex items-center gap-1.5">
                                    <span className="size-3 rounded-full bg-orange-500" />
                                    <span className="text-xs text-muted-foreground">Excluded</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Grid of campground cards OR table */}
                    {viewMode === "calendar" ? (
                        <>
                            {/* Desktop: two columns interleaved */}
                            <div className="hidden gap-4 md:grid md:grid-cols-2 md:items-start">
                                <div className="flex flex-col gap-4">
                                    {flattenedCampgrounds
                                        .filter((_, i) => i % 2 === 0)
                                        .map((cg, i) => renderCampgroundCard(cg, i * 2))}
                                </div>
                                <div className="flex flex-col gap-4">
                                    {flattenedCampgrounds
                                        .filter((_, i) => i % 2 === 1)
                                        .map((cg, i) => renderCampgroundCard(cg, i * 2 + 1))}
                                </div>
                            </div>
                            {/* Mobile: single column */}
                            <div className="flex flex-col gap-4 md:hidden">
                                {flattenedCampgrounds.map((cg, i) => renderCampgroundCard(cg, i))}
                            </div>
                        </>
                    ) : (
                        /* Table view */
                        <div className="rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Campground</TableHead>
                                        <TableHead>Matches</TableHead>
                                        <TableHead>Favorites</TableHead>
                                        <TableHead>Excluded</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {flattenedCampgrounds.map((campground) => {
                                        const campgroundId = getCampgroundId(campground);
                                        const stats = getCampgroundStats(campground);
                                        const hasAvail = checkForGroupedAvailability(campground);
                                        const badge = getTypeBadge(campground);
                                        const TypeIcon = badge.Icon;
                                        return (
                                            <TableRow key={campgroundId}>
                                                <TableCell>
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <TypeIcon
                                                                        className="size-4 shrink-0"
                                                                        style={{ color: badge.color }}
                                                                    />
                                                                </TooltipTrigger>
                                                                <TooltipContent>{badge.label}</TooltipContent>
                                                            </Tooltip>
                                                            <span className="text-sm font-medium">
                                                                {campground.name}
                                                            </span>
                                                            <a
                                                                href={getCampgroundUrl(campground)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex text-muted-foreground hover:text-primary"
                                                            >
                                                                <ExternalLink className="size-3" />
                                                            </a>
                                                        </div>
                                                        {campground.area && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {campground.area}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{stats.totalMatches}</TableCell>
                                                <TableCell>{stats.favoriteMatches}</TableCell>
                                                <TableCell>
                                                    {stats.totalExcluded > 0 ? (
                                                        <Badge
                                                            variant={
                                                                showExcludedMap[campgroundId]
                                                                    ? "default"
                                                                    : "outline"
                                                            }
                                                            className={cn(
                                                                "cursor-pointer border-blue-400",
                                                                showExcludedMap[campgroundId]
                                                                    ? "bg-blue-500 text-white"
                                                                    : "text-blue-600",
                                                            )}
                                                            onClick={toggleShowExcluded(campgroundId)}
                                                        >
                                                            {showExcludedMap[campgroundId]
                                                                ? `Hide ${stats.totalExcluded}`
                                                                : stats.totalExcluded}
                                                        </Badge>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {hasAvail ? (
                                                        <Badge variant="outline" className="border-green-500 text-green-700">
                                                            Has matches
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline">No matches</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            )}

            {/* Image preview dialog */}
            <Dialog open={imagePreview.open} onOpenChange={(open) => !open && handleImageClose()}>
                <DialogContent
                    className="max-w-sm p-0 overflow-hidden"
                    showCloseButton={false}
                >
                    <img
                        src={imagePreview.src}
                        alt={imagePreview.alt}
                        className="h-auto w-full"
                        loading="lazy"
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
