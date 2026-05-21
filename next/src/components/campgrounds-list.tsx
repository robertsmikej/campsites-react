"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchX, Star, Rows2, Rows3 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CampgroundRow } from "@/components/campground-row";
import { getCampgroundImageUrl } from "@/components/campground/get-image-url";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import type { ProcessedCampground, GlobalSettings, SiteAvailability, StayMatch } from "@/types/campground";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Format a local date as YYYY-MM-DD without timezone drift.
function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SortOrder = "availability" | "alpha" | "favorites-first";
type Density = "comfortable" | "compact";

type DateWindowKey =
    | "this-weekend"
    | "next-weekend"
    | "14d"
    | "30d"
    | "60d";

interface DateWindow {
    key: DateWindowKey;
    label: string;
    getRange: () => { start: Date; end: Date } | null; // null = default (days-based, no explicit range)
    days: number; // used when getRange() is null, for the strip's `days` prop
}

/** Get the upcoming Friday relative to `now` (or today if today is Fri). */
function getNextFriday(now: Date, weeksAhead = 0): Date {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Sun…6=Sat
    const daysUntilFri = ((5 - dow + 7) % 7) || 7; // always ≥1 if not Fri; but if Fri, 7 for "next" or 0 for "this"
    const thisFri = new Date(d);
    thisFri.setDate(d.getDate() + ((5 - dow + 7) % 7));
    thisFri.setDate(thisFri.getDate() + weeksAhead * 7);
    return thisFri;
}

function buildDateWindows(): DateWindow[] {
    return [
        {
            key: "this-weekend",
            label: "This weekend",
            days: 3,
            getRange: () => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const dow = now.getDay();
                // If today is Mon-Thu, find the coming Friday
                // If Fri/Sat/Sun, it's "this" weekend: Fri through Sun
                let start: Date;
                if (dow === 0) {
                    // Sunday — this weekend is technically over; show coming Fri
                    start = getNextFriday(now);
                } else if (dow <= 5) {
                    // Mon-Fri: get the coming Friday (same week)
                    start = new Date(now);
                    start.setDate(now.getDate() + ((5 - dow + 7) % 7));
                } else {
                    // Saturday: Fri was yesterday
                    start = new Date(now);
                    start.setDate(now.getDate() - 1);
                }
                const end = new Date(start);
                end.setDate(start.getDate() + 2); // Fri, Sat, Sun
                return { start, end };
            },
        },
        {
            key: "next-weekend",
            label: "Next weekend",
            days: 3,
            getRange: () => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const dow = now.getDay();
                // "Next weekend" = the Fri 8-14 days out
                const thisFri = new Date(now);
                thisFri.setDate(now.getDate() + ((5 - dow + 7) % 7));
                const nextFri = new Date(thisFri);
                nextFri.setDate(thisFri.getDate() + 7);
                const end = new Date(nextFri);
                end.setDate(nextFri.getDate() + 2);
                return { start: nextFri, end };
            },
        },
        {
            key: "14d",
            label: "Next 14d",
            days: 14,
            getRange: () => null,
        },
        {
            key: "30d",
            label: "Next 30d",
            days: 30,
            getRange: () => null,
        },
        {
            key: "60d",
            label: "Next 60d",
            days: 60,
            getRange: () => null,
        },
    ];
}

/** Read a value from localStorage safely. */
function readStorage<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/** Write a value to localStorage safely. */
function writeStorage(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // ignore storage errors
    }
}

// ---------------------------------------------------------------------------
// Coming up soon
// ---------------------------------------------------------------------------

interface ComingUpItem {
    campground: ProcessedCampground;
    site: SiteAvailability;
    match: StayMatch;
}

function getComingUpSoon(campgrounds: ProcessedCampground[], maxItems = 3): ComingUpItem[] {
    const todayIso = toLocalIso(new Date());
    const items: ComingUpItem[] = [];
    for (const c of campgrounds) {
        for (const s of Object.values(c.siteAvailability ?? {})) {
            for (const m of s.matches ?? []) {
                if (m.from >= todayIso) {
                    items.push({ campground: c, site: s, match: m });
                }
            }
        }
    }
    items.sort((a, b) => a.match.from.localeCompare(b.match.from));
    return items.slice(0, maxItems);
}

function formatMatchDateRange(match: StayMatch): string {
    const from = new Date(match.from + "T00:00:00");
    const to = new Date(match.to + "T00:00:00");
    // to is exclusive, so the last night is `to - 1 day`
    const lastNight = new Date(to);
    lastNight.setDate(to.getDate() - 1);

    const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

    if (from.toDateString() === lastNight.toDateString()) {
        return `${dayFmt.format(from)}, ${dateFmt.format(from)}`;
    }
    return `${dayFmt.format(from)}–${dayFmt.format(lastNight)}, ${dateFmt.format(from)}–${dateFmt.format(lastNight)}`;
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

function LoadingSkeletons() {
    return (
        <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                    <div className="size-12 shrink-0 animate-pulse rounded-md bg-muted" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="hidden h-8 flex-1 max-w-md animate-pulse rounded-md bg-muted md:block" />
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CampgroundsListProps {
    campgrounds: ProcessedCampground[] | Record<string, ProcessedCampground[]>;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isLoading?: boolean;
    /** Called when the user toggles a site's rating from the drawer. */
    onRatingChange?: (campgroundId: string, siteName: string, newRating: "favorite" | "worthwhile" | "unrated") => void;
    /** Called when the user clicks "Edit settings" in the drawer. */
    onEditSettings?: (campgroundId: string) => void;
    /** When true, hides all mutating controls (favorites, ratings, edit settings, sync banner). */
    readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampgroundsList({
    campgrounds: campgroundsProp,
    settings,
    globalSettings,
    isLoading = false,
    onRatingChange,
    onEditSettings,
    readOnly = false,
}: CampgroundsListProps) {
    // Flatten if given a record of groups (matches CampgroundsGroups behaviour)
    const flattenedCampgrounds = useMemo<ProcessedCampground[]>(() => {
        if (Array.isArray(campgroundsProp)) {
            return campgroundsProp.filter(Boolean) as ProcessedCampground[];
        }
        return Object.values(campgroundsProp ?? {}).flat();
    }, [campgroundsProp]);

    // ---- filter state ----
    const [favoritesOnly, setFavoritesOnly] = useState(false);
    const [showExcluded, setShowExcluded] = useState(false);

    // ---- search ----
    const [search, setSearch] = useState("");

    // ---- sort — persisted ----
    const [sortOrder, setSortOrder] = useState<SortOrder>(() =>
        readStorage<SortOrder>("campwatch:sort", "availability"),
    );
    const handleSortChange = (val: SortOrder) => {
        setSortOrder(val);
        writeStorage("campwatch:sort", val);
    };

    // ---- density — persisted ----
    const [density, setDensity] = useState<Density>(() =>
        readStorage<Density>("campwatch:density", "comfortable"),
    );
    const toggleDensity = () => {
        setDensity((prev) => {
            const next: Density = prev === "comfortable" ? "compact" : "comfortable";
            writeStorage("campwatch:density", next);
            return next;
        });
    };

    // ---- date window — persisted ----
    const DATE_WINDOWS = useMemo(() => buildDateWindows(), []);
    const [activeWindowKey, setActiveWindowKey] = useState<DateWindowKey>(() =>
        readStorage<DateWindowKey>("campwatch:date-window", "60d"),
    );
    const handleWindowChange = (key: DateWindowKey) => {
        setActiveWindowKey(key);
        writeStorage("campwatch:date-window", key);
    };

    const activeWindow = useMemo(
        () => DATE_WINDOWS.find((w) => w.key === activeWindowKey) ?? DATE_WINDOWS[4],
        [DATE_WINDOWS, activeWindowKey],
    );

    // Compute the concrete Date range for the strip / badge count
    const windowRange = useMemo<{ start: Date; end: Date } | null>(() => {
        return activeWindow.getRange();
    }, [activeWindow]);

    // For chips that use days (no explicit range), compute virtual start/end for badge counting
    const effectiveWindowStart = useMemo<Date>(() => {
        if (windowRange) return windowRange.start;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, [windowRange]);

    const effectiveWindowEnd = useMemo<Date>(() => {
        if (windowRange) return windowRange.end;
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + activeWindow.days - 1);
        return d;
    }, [windowRange, activeWindow]);

    // ---- favorites — persisted to localStorage ----
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const raw = localStorage.getItem("campwatch:favorites");
            if (!raw) return new Set();
            return new Set(JSON.parse(raw) as string[]);
        } catch {
            return new Set();
        }
    });

    const toggleFavorite = (id: string) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            writeStorage("campwatch:favorites", Array.from(next));
            return next;
        });
    };

    // ---- filter + sort chain ----
    const filtered = useMemo(() => {
        let list = flattenedCampgrounds;

        // 1. search
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    (c.area ?? "").toLowerCase().includes(q),
            );
        }

        // 2. favorites-only
        if (favoritesOnly) {
            list = list.filter((c) => c.id && favorites.has(c.id));
        }

        // 3. sort
        const openCount = (c: ProcessedCampground) =>
            getCampgroundOpenCount(c, effectiveWindowStart, effectiveWindowEnd);

        if (sortOrder === "alpha") {
            list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortOrder === "favorites-first") {
            list = [...list].sort((a, b) => {
                const aFav = a.id && favorites.has(a.id) ? 0 : 1;
                const bFav = b.id && favorites.has(b.id) ? 0 : 1;
                if (aFav !== bFav) return aFav - bFav;
                return a.name.localeCompare(b.name);
            });
        } else {
            // default: most availability
            list = [...list].sort((a, b) => openCount(b) - openCount(a));
        }

        return list;
    }, [
        flattenedCampgrounds,
        search,
        favoritesOnly,
        favorites,
        sortOrder,
        effectiveWindowStart,
        effectiveWindowEnd,
    ]);

    // ---- coming up soon ----
    const comingUpSoon = useMemo(
        () => getComingUpSoon(flattenedCampgrounds),
        [flattenedCampgrounds],
    );

    // ---- loading state ----
    if (isLoading && flattenedCampgrounds.length === 0) {
        return <LoadingSkeletons />;
    }

    // ---- empty config state ----
    if (!isLoading && flattenedCampgrounds.length === 0) {
        return (
            <div className="rounded-xl border p-6">
                <p className="text-sm text-muted-foreground">
                    No campgrounds configured yet.
                </p>
            </div>
        );
    }

    const isSearchEmpty = search.trim() !== "" && filtered.length === 0;
    const isFavoritesEmpty = favoritesOnly && filtered.length === 0;

    return (
        <div className="space-y-4">
            {/* ------------------------------------------------------------------ */}
            {/* Sticky filter bar                                                   */}
            {/* ------------------------------------------------------------------ */}
            <div className="sticky top-16 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                {/* Row 1: search + sort + density */}
                <div className="flex flex-wrap items-center gap-2">
                    <Input
                        placeholder="Search campgrounds…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 w-48 text-sm"
                    />

                    <Select value={sortOrder} onValueChange={(v) => handleSortChange(v as SortOrder)}>
                        <SelectTrigger size="sm" className="w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="availability">Most availability</SelectItem>
                            <SelectItem value="alpha">Alphabetical</SelectItem>
                            <SelectItem value="favorites-first">Favorites first</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 ml-auto">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {filtered.length} of {flattenedCampgrounds.length} campground{flattenedCampgrounds.length === 1 ? "" : "s"}
                        </p>

                        {/* Density toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleDensity}
                            aria-label={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
                            className="h-8 w-8"
                        >
                            {density === "comfortable" ? (
                                <Rows3 className="size-4" />
                            ) : (
                                <Rows2 className="size-4" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Row 2: date chips + favorites/excluded toggles */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* Date window chips — scrollable on narrow screens */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                        {DATE_WINDOWS.map((w) => (
                            <Button
                                key={w.key}
                                size="sm"
                                variant={activeWindowKey === w.key ? "default" : "outline"}
                                className="h-7 shrink-0 px-2.5 text-xs"
                                onClick={() => handleWindowChange(w.key)}
                            >
                                {w.label}
                            </Button>
                        ))}
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-3">
                        {!readOnly && (
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="favorites-only"
                                    checked={favoritesOnly}
                                    onCheckedChange={setFavoritesOnly}
                                    disabled={favorites.size === 0}
                                />
                                <Label htmlFor="favorites-only" className="text-xs">
                                    Favorites only
                                </Label>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Switch
                                id="show-excluded"
                                checked={showExcluded}
                                onCheckedChange={setShowExcluded}
                            />
                            <Label htmlFor="show-excluded" className="text-xs">
                                Show filtered
                            </Label>
                        </div>
                    </div>
                </div>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Coming up soon                                                      */}
            {/* ------------------------------------------------------------------ */}
            {comingUpSoon.length > 0 && (
                <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Coming up soon
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        {comingUpSoon.map((item, i) => (
                            <Card
                                key={`${item.campground.id}-${item.site.siteId}-${item.match.from}-${i}`}
                                size="sm"
                                className="flex-1 cursor-pointer transition-all hover:border-primary/30 hover:shadow-sm"
                            >
                                <CardContent className="py-2">
                                    <p className="truncate text-xs font-semibold leading-tight">
                                        {item.campground.name}
                                    </p>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {item.site.siteName}
                                    </p>
                                    <p className="mt-1 text-[11px] font-medium text-primary">
                                        {formatMatchDateRange(item.match)}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* Column axis label (desktop only)                                    */}
            {/* ------------------------------------------------------------------ */}
            {filtered.length > 0 && (
                <div className="hidden items-center gap-3 px-3 text-[10px] uppercase tracking-wide text-muted-foreground md:flex">
                    {/* align with thumbnail */}
                    <div className={density === "compact" ? "size-9 shrink-0" : "size-12 shrink-0"} />
                    {/* align with name column */}
                    <div className="min-w-0 flex-1" />
                    {/* align with strip */}
                    <div className="flex flex-1 max-w-md justify-between">
                        {windowRange ? (
                            <>
                                <span>
                                    {windowRange.start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                                <span>
                                    {windowRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                            </>
                        ) : (
                            <>
                                <span>Today</span>
                                {activeWindow.days > 14 && <span>+{Math.round(activeWindow.days / 2)}d</span>}
                                <span>+{activeWindow.days}d</span>
                            </>
                        )}
                    </div>
                    {/* align with favorite button */}
                    <div className="w-9" />
                    {/* align with chevron */}
                    <div className="w-4" />
                </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* Campground rows                                                     */}
            {/* ------------------------------------------------------------------ */}
            <div className="space-y-2">
                {filtered.map((c) => {
                    // Build a SiteRatingsMap from the campground's stored favorites/worthwhile lists
                    const siteRatings: Record<string, "favorite" | "worthwhile"> = {};
                    for (const name of c.sites?.favorites ?? []) {
                        siteRatings[name] = "favorite";
                    }
                    for (const name of c.sites?.worthwhile ?? []) {
                        if (!(name in siteRatings)) siteRatings[name] = "worthwhile";
                    }
                    const hasSiteRatings = Object.keys(siteRatings).length > 0;

                    return (
                        <CampgroundRow
                            key={c.id ?? c.name}
                            campground={c}
                            showExcluded={showExcluded}
                            isFavorite={!!c.id && favorites.has(c.id)}
                            onToggleFavorite={() => c.id && toggleFavorite(c.id)}
                            settings={settings}
                            globalSettings={globalSettings}
                            imageUrl={getCampgroundImageUrl(c)}
                            siteRatings={hasSiteRatings ? siteRatings : undefined}
                            onRatingChange={
                                onRatingChange && c.id
                                    ? (siteName, newRating) =>
                                          onRatingChange(c.id!, siteName, newRating)
                                    : undefined
                            }
                            onEditSettings={
                                onEditSettings && c.id
                                    ? () => onEditSettings(c.id!)
                                    : undefined
                            }
                            density={density}
                            windowStart={effectiveWindowStart}
                            windowEnd={effectiveWindowEnd}
                            readOnly={readOnly}
                        />
                    );
                })}
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Empty state                                                          */}
            {/* ------------------------------------------------------------------ */}
            {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center">
                    {isSearchEmpty ? (
                        <>
                            <SearchX className="size-8 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-semibold">No matches</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    No campgrounds match &ldquo;{search}&rdquo;.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSearch("")}
                            >
                                Clear search
                            </Button>
                        </>
                    ) : isFavoritesEmpty ? (
                        <>
                            <Star className="size-8 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-semibold">No favorites yet</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Toggle the star on any campground row to add it here.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setFavoritesOnly(false)}
                            >
                                Show all campgrounds
                            </Button>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">No campgrounds to show.</p>
                    )}
                </div>
            )}
        </div>
    );
}
