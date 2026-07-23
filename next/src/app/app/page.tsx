"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import SiteSettingsContext from "@/contexts/site-settings";
import ProgressBarContext from "@/contexts/progress-bar";
import { Button } from "@/components/ui/button";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useNowTick } from "@/hooks/use-now-tick";
import { useDashboardPrefs } from "@/hooks/use-dashboard-prefs";
import { writeStorage } from "@/components/dashboard/helpers";
import { formatRelativeTime } from "@/lib/relative-time";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { AddCampgroundDialog } from "@/components/dashboard/add-campground-dialog";
import { DashboardErrorBoundary } from "@/components/dashboard/error-boundary";
import { Greeting } from "@/components/dashboard/greeting";
import { TripsCard } from "@/components/dashboard/trips-card/trips-card";
import { WatchlistSection } from "@/components/dashboard/watchlist-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PushNudge } from "@/components/dashboard/push-nudge";
import { siteData } from "@/data/site-data";
import { recentlyAddedFromDefault } from "@/lib/default-additions";
import type { SiteSettingsValue } from "@/contexts/site-settings";
import type { Campground, TripWindow } from "@/types/campground";
// import type { GroupBy } from "@/hooks/use-dashboard-prefs"; // kept for future grouping UI

export default function AppPage() {
    const auth = useAuth();
    const userCampgrounds = useUserCampgrounds();
    const {
        siteConfig,
        globalSettings,
        isHydrating,
        syncStatus,
        syncError,
        clearSyncStatus,
        save,
        cloneDefault,
        startBlank,
    } = userCampgrounds;

    const isMobile = useIsMobile();
    const [useMockData] = useState(false);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [focusedCampgroundId, setFocusedCampgroundId] = useState<string | null>(null);
    const [dismissedSync, setDismissedSync] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addInitialQuery, setAddInitialQuery] = useState<string | undefined>(undefined);
    const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

    // Carried-through add intent: a user who looked up a campground on the
    // homepage and signed in lands here as `/app?add=<id>`. Open the add dialog
    // pre-filled with that id, then strip the param so a refresh/back doesn't
    // reopen it.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const addId = params.get("add");
        if (!addId) return;
        setAddInitialQuery(addId);
        setAddModalOpen(true);
        params.delete("add");
        const qs = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }, []);

    // Latest season-end across the user's watched campgrounds. The default
    // date range clamps to this so the strip doesn't show dead ticks past the
    // last bookable day.
    const maxWatchlistEnd = useMemo(() => {
        let latest: Date | null = null;
        for (const cg of siteConfig["recreation.gov"] ?? []) {
            const iso = cg.dates?.endDate;
            if (!iso) continue;
            const d = new Date(iso + "T00:00:00");
            if (!latest || d > latest) latest = d;
        }
        return latest ?? undefined;
    }, [siteConfig]);

    // Dashboard preferences (date range) — single persisted blob.
    const {
        dateRange,
        calRange,
        hasCustomRange,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        clearDateRange,
    } = useDashboardPrefs({ maxEnd: maxWatchlistEnd });

    // Favorites
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const raw = localStorage.getItem("campwatch:favorites");
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
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

    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
                blackoutDates: globalSettings.blackoutDates,
                tripWindows: globalSettings.tripWindows,
            },
            views: { type: "calendar" as const },
            dev: { useMockData },
        }),
        [globalSettings, useMockData],
    );

    const { campgroundsByAreas, isFetching, progressBarData, loadError, updatedAt, refresh } =
        useCampgroundsData({
            enabled: !isHydrating,
            siteConfig,
        });

    // Surface a background availability-fetch failure (otherwise the watchlist
    // just silently shows stale/empty data, indistinguishable from "no openings").
    useEffect(() => {
        if (!loadError) return;
        toast.warning("Couldn't load the latest availability", {
            id: "availability-load-error",
            description: "Showing what we had last. Your watchlist may be out of date.",
            action: { label: "Retry", onClick: () => refresh() },
        });
    }, [loadError, refresh]);

    // Rating change handler
    const handleRatingChange = useCallback(
        (campgroundId: string, siteName: string, newRating: "favorite" | "worthwhile" | "unrated") => {
            const campgrounds = siteConfig["recreation.gov"] ?? [];
            const updated = campgrounds.map((cg) => {
                if (cg.id !== campgroundId) return cg;
                const favs = (cg.sites?.favorites ?? []).filter((s) => s !== siteName);
                const worthwhile = (cg.sites?.worthwhile ?? []).filter((s) => s !== siteName);
                if (newRating === "favorite") favs.push(siteName);
                else if (newRating === "worthwhile") worthwhile.push(siteName);
                return { ...cg, sites: { favorites: favs, worthwhile } };
            });
            void save({ ...siteConfig, "recreation.gov": updated }, globalSettings);
        },
        [siteConfig, globalSettings, save],
    );

    const handleTripWindowsChange = useCallback(
        (next: TripWindow[]) => {
            void save(siteConfig, { ...globalSettings, tripWindows: next });
        },
        [siteConfig, globalSettings, save],
    );

    useEffect(() => {
        if (syncStatus === null) return;
        if (syncStatus === "success") {
            toast.success("Settings synced to notifications");
        } else {
            toast.warning(syncError ?? "Settings saved locally but failed to sync");
        }
        clearSyncStatus();
    }, [syncStatus, syncError, clearSyncStatus]);

    const isLoading = isFetching || isHydrating;
    const isEmpty = !userCampgrounds.isHydrating && userCampgrounds.isEmpty;

    // Campgrounds the curator has added to the default since this user last saw
    // it, that the user doesn't already have — the "recently added" nudge.
    const recentlyAdded = useMemo(
        () =>
            recentlyAddedFromDefault(
                userCampgrounds.defaultCampgrounds,
                siteConfig["recreation.gov"] ?? [],
                auth.user?.defaultSeenAt,
            ),
        [userCampgrounds.defaultCampgrounds, siteConfig, auth.user?.defaultSeenAt],
    );

    const handleAddRecent = useCallback(
        async (c: Campground) => {
            setAddingIds((prev) => new Set(prev).add(c.id));
            try {
                await userCampgrounds.addCampground(c);
                toast.success(`Added ${c.name}`);
            } finally {
                setAddingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(c.id);
                    return next;
                });
            }
        },
        [userCampgrounds],
    );

    const handleDismissRecent = useCallback(async () => {
        setDismissedSync(true);
        await userCampgrounds.dismissRecentlyAdded();
        await auth.refresh();
    }, [userCampgrounds, auth]);

    const handleAddDefaults = useCallback(async () => {
        const { added } = await userCampgrounds.addAllFromDefault();
        await auth.refresh();
        toast.success(
            added > 0
                ? `Added ${added} campground${added === 1 ? "" : "s"}`
                : "You already have all the curator's picks",
        );
    }, [userCampgrounds, auth]);

    const handleStartFresh = useCallback(async () => {
        await startBlank();
        toast.success("Cleared your watchlist — add any campground to start again");
    }, [startBlank]);

    // Compute open counts within date range
    const openCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of campgroundsByAreas) {
            m.set(c.id ?? c.name, getCampgroundOpenCount(c, dateRange.start, dateRange.end));
        }
        return m;
    }, [campgroundsByAreas, dateRange]);

    const campgroundsWithOpenings = useMemo(
        () => campgroundsByAreas.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) > 0).length,
        [campgroundsByAreas, openCounts],
    );

    // Drives the "Updated Xm ago" freshness label (re-renders on tick).
    const nowMs = useNowTick(30_000);

    // PAD kept for components that still use it for dynamic scroll containers / section padding
    const PAD = isMobile ? 22 : 36;

    return (
        <>
            <style>{`
                @keyframes cw-pulse {
                    0%  { transform: scale(0.6); opacity: 0.9; }
                    100%{ transform: scale(2.4); opacity: 0; }
                }
                .cw-tb-add:hover { opacity: 0.85; }
            `}</style>

            <SiteSettingsContext.Provider value={settings}>
                <ProgressBarContext.Provider value={progressBarData}>
                    <DashboardTopBar
                        auth={auth}
                        onAddCampground={() => setAddModalOpen(true)}
                        onRefresh={refresh}
                        isRefreshing={isFetching}
                        lastUpdatedLabel={formatRelativeTime(updatedAt, nowMs)}
                    />

                    <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                        <div className="mx-auto w-full max-w-screen-2xl">
                            {/* Recently-added-by-the-curator nudge: add each individually */}
                            {recentlyAdded.length > 0 && !dismissedSync && (
                                <div className="px-[22px] py-3 md:px-9">
                                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                                        <div className="flex items-center gap-3">
                                            <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                                            <p className="min-w-0 flex-1 font-medium">
                                                The curator added {recentlyAdded.length} new campground
                                                {recentlyAdded.length === 1 ? "" : "s"}
                                            </p>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => void handleDismissRecent()}
                                                aria-label="Dismiss"
                                            >
                                                <X className="size-4" />
                                            </Button>
                                        </div>
                                        <ul className="mt-2 flex flex-col gap-1.5">
                                            {recentlyAdded.map((c) => (
                                                <li
                                                    key={c.id}
                                                    className="flex items-center justify-between gap-3"
                                                >
                                                    <span className="min-w-0 truncate">{c.name}</span>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={addingIds.has(c.id)}
                                                        onClick={() => void handleAddRecent(c)}
                                                    >
                                                        {addingIds.has(c.id) ? "Adding…" : "Add"}
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            <PushNudge />

                            {isEmpty ? (
                                <DashboardErrorBoundary section="Empty state">
                                    <EmptyState onClone={cloneDefault} />
                                </DashboardErrorBoundary>
                            ) : (
                                <>
                                    <DashboardErrorBoundary section="Greeting">
                                        <Greeting
                                            auth={auth}
                                            isLoading={isLoading}
                                            campgroundsWithOpenings={campgroundsWithOpenings}
                                        />
                                    </DashboardErrorBoundary>

                                    <DashboardErrorBoundary section="Trips">
                                        <TripsCard
                                            tripWindows={globalSettings.tripWindows ?? []}
                                            campgrounds={siteConfig["recreation.gov"] ?? []}
                                            campgroundsByAreas={campgroundsByAreas}
                                            onChange={handleTripWindowsChange}
                                            isMobile={isMobile}
                                        />
                                    </DashboardErrorBoundary>

                                    <DashboardErrorBoundary section="Watchlist">
                                        <WatchlistSection
                                            campgroundsByAreas={campgroundsByAreas}
                                            openCounts={openCounts}
                                            isLoading={isLoading}
                                            dateRange={dateRange}
                                            calRange={calRange}
                                            hasCustomRange={hasCustomRange}
                                            datePickerOpen={datePickerOpen}
                                            setDatePickerOpen={setDatePickerOpen}
                                            handleCalSelect={handleCalSelect}
                                            onClearDates={clearDateRange}
                                            favorites={favorites}
                                            onToggleFavorite={toggleFavorite}
                                            settings={settings as { views?: { type?: "calendar" | "table" } }}
                                            globalSettings={globalSettings}
                                            isMobile={isMobile}
                                            onRatingChange={handleRatingChange}
                                            onEditSettings={(id) => {
                                                setFocusedCampgroundId(id);
                                                setIsConfigDialogOpen(true);
                                            }}
                                            onEditAll={() => {
                                                setFocusedCampgroundId(null);
                                                setIsConfigDialogOpen(true);
                                            }}
                                            PAD={PAD}
                                        />
                                    </DashboardErrorBoundary>
                                </>
                            )}

                            {/* Footer */}
                            <footer className="px-[22px] md:px-9 pt-5 pb-9 flex justify-between font-mono-field text-[13px] font-medium leading-none tracking-[0.12em] text-cw-ink-faint uppercase flex-wrap gap-2">
                                <span>Built by a camper, for campers</span>
                                <span>{siteData.name}</span>
                            </footer>
                        </div>
                    </main>

                    <SiteConfigDialog
                        open={isConfigDialogOpen}
                        onClose={() => {
                            setIsConfigDialogOpen(false);
                            setFocusedCampgroundId(null);
                        }}
                        onSave={(config, nextGlobal) => {
                            void save(config, nextGlobal);
                            setIsConfigDialogOpen(false);
                            setFocusedCampgroundId(null);
                        }}
                        onAddDefaults={() => void handleAddDefaults()}
                        onStartFresh={() => void handleStartFresh()}
                        initialData={siteConfig}
                        globalSettings={globalSettings}
                        availableSites={{}}
                        useMockData={false}
                        onToggleMockData={() => {}}
                        focusedCampgroundId={focusedCampgroundId}
                    />
                </ProgressBarContext.Provider>
            </SiteSettingsContext.Provider>

            <AddCampgroundDialog
                open={addModalOpen}
                onClose={() => {
                    setAddModalOpen(false);
                    setAddInitialQuery(undefined);
                }}
                initialQuery={addInitialQuery}
            />
        </>
    );
}
