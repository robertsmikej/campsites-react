"use client";

import { useMemo, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CampgroundRow } from "@/components/campground-row";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getImageUrl(c: ProcessedCampground): string {
    if (!c.image) return "/images/sites/bg_default.jpg";
    if (c.image.startsWith("http")) return c.image;
    return c.image.startsWith("/images/") ? c.image : `/images/sites/${c.image}`;
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
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem(
                        "campwatch:favorites",
                        JSON.stringify(Array.from(next)),
                    );
                } catch {
                    // ignore storage errors
                }
            }
            return next;
        });
    };

    // ---- filtered list ----
    const filtered = useMemo(() => {
        if (!favoritesOnly) return flattenedCampgrounds;
        return flattenedCampgrounds.filter(
            (c) => c.id && favorites.has(c.id),
        );
    }, [flattenedCampgrounds, favoritesOnly, favorites]);

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

    return (
        <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-2">
                <p className="text-sm text-muted-foreground">
                    {filtered.length} campground
                    {filtered.length === 1 ? "" : "s"}
                    {favorites.size > 0
                        ? ` · ${favorites.size} favorited`
                        : ""}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="favorites-only"
                            checked={favoritesOnly}
                            onCheckedChange={setFavoritesOnly}
                            disabled={favorites.size === 0}
                        />
                        <Label htmlFor="favorites-only" className="text-sm">
                            Favorites only
                        </Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="show-excluded"
                            checked={showExcluded}
                            onCheckedChange={setShowExcluded}
                        />
                        <Label htmlFor="show-excluded" className="text-sm">
                            Show filtered
                        </Label>
                    </div>
                </div>
            </div>

            {/* 60-day axis label row (desktop only) */}
            <div className="hidden items-center gap-3 px-3 text-[10px] uppercase tracking-wide text-muted-foreground md:flex">
                {/* align with thumbnail */}
                <div className="size-12 shrink-0" />
                {/* align with name column */}
                <div className="min-w-0 flex-1" />
                {/* align with strip */}
                <div className="flex flex-1 max-w-md justify-between">
                    <span>Today</span>
                    <span>+30d</span>
                    <span>+60d</span>
                </div>
                {/* align with favorite button */}
                <div className="w-9" />
                {/* align with chevron */}
                <div className="w-4" />
            </div>

            {/* Campground rows */}
            <div className="space-y-2">
                {filtered.map((c) => {
                    // Build a SiteRatingsMap from the campground's stored favorites/worthwhile lists
                    const siteRatings: Record<string, "favorite" | "worthwhile"> = {};
                    for (const name of c.sites?.favorites ?? []) {
                        siteRatings[name] = "favorite";
                    }
                    for (const name of c.sites?.worthwhile ?? []) {
                        // Don't overwrite if already in favorites
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
                            imageUrl={getImageUrl(c)}
                            siteRatings={hasSiteRatings ? siteRatings : undefined}
                            onRatingChange={
                                onRatingChange && c.id
                                    ? (siteName, newRating) =>
                                          onRatingChange(c.id!, siteName, newRating)
                                    : undefined
                            }
                        />
                    );
                })}
            </div>

            {/* Empty state after filtering */}
            {filtered.length === 0 && (
                <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                    {favoritesOnly
                        ? "No favorited campgrounds. Toggle the star on any row to add favorites."
                        : "No campgrounds to show."}
                </div>
            )}
        </div>
    );
}
