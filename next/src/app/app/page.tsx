"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import SiteSettingsContext from "@/context/site-settings";
import ProgressBarContext from "@/context/progress-bar";
import { Button } from "@/components/ui/button";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useNowTick } from "@/hooks/use-now-tick";
import { useRecentOpenings } from "@/hooks/use-recent-openings";
import { useDashboardPrefs } from "@/hooks/use-dashboard-prefs";
import { toLocalIso, writeStorage } from "@/components/dashboard/helpers";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { AddCampgroundDialog } from "@/components/dashboard/add-campground-dialog";
import { DashboardErrorBoundary } from "@/components/dashboard/error-boundary";
import { Greeting } from "@/components/dashboard/greeting";
import { OpeningsFeed } from "@/components/dashboard/openings-feed";
import { WatchlistSection } from "@/components/dashboard/watchlist-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { siteData } from "@/data/site-data";
import { recentlyAddedFromDefault } from "@/lib/default-additions";
import type { SiteSettingsValue } from "@/context/site-settings";
import type { OpeningItem } from "@/components/dashboard/openings-feed";
import type { Campground } from "@/types/campground";
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
    const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

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
            },
            views: { type: "calendar" as const },
            dev: { useMockData },
        }),
        [globalSettings, useMockData],
    );

    const { campgroundsByAreas, isFetching, progressBarData } = useCampgroundsData({
        enabled: !isHydrating,
        siteConfig,
    });

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

    // Openings feed
    const nowMs = useNowTick(30_000);
    const recentOpenings = useRecentOpenings();

    const userCampgroundIds = useMemo(() => {
        const ids = new Set<string>();
        for (const c of siteConfig["recreation.gov"] ?? []) {
            if (c.id) ids.add(c.id);
        }
        return ids;
    }, [siteConfig]);

    // Build a lookup of currently-bookable (campgroundId, siteId, from, to) tuples
    // from the snapshot, so we can suppress recent-openings entries that have
    // already been booked.
    const stillAvailable = useMemo(() => {
        const set = new Set<string>();
        for (const cg of campgroundsByAreas) {
            if (!cg.id || !cg.siteAvailability) continue;
            for (const site of Object.values(cg.siteAvailability)) {
                for (const m of site.matches ?? []) {
                    set.add(`${cg.id}|${site.siteId}|${m.from}|${m.to}`);
                }
            }
        }
        return set;
    }, [campgroundsByAreas]);

    const openingItems = useMemo((): OpeningItem[] => {
        const winStartIso = toLocalIso(dateRange.start);
        const winEndIso = toLocalIso(dateRange.end);

        const items: OpeningItem[] = recentOpenings
            .filter((r) => {
                if (!userCampgroundIds.has(r.campgroundId)) return false;
                if (r.to <= winStartIso || r.from > winEndIso) return false;
                if (!stillAvailable.has(`${r.campgroundId}|${r.siteId}|${r.from}|${r.to}`)) return false;
                return true;
            })
            .map((r) => {
                const id = `${r.campgroundId}-${r.siteId}-${r.from}`;
                return {
                    id,
                    campgroundId: r.campgroundId,
                    campgroundName: r.campgroundName,
                    siteId: r.siteId,
                    siteName: r.siteName,
                    from: r.from,
                    to: r.to,
                    nights: r.nights,
                    recGovId: r.campgroundId,
                    detectedAt: r.detectedAt,
                };
            });

        items.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
        return items.slice(0, 8);
    }, [recentOpenings, userCampgroundIds, dateRange, stillAvailable]);

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
                    <DashboardTopBar auth={auth} onAddCampground={() => setAddModalOpen(true)} />

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

                                    <div style={{ padding: `8px ${PAD}px` }}>
                                        <Link
                                            href="/app/plan"
                                            className="flex items-center justify-between gap-4 no-underline border-[1.5px] border-cw-ink bg-cw-cream text-cw-ink"
                                            style={{
                                                boxShadow: "4px 4px 0 var(--cw-forest)",
                                                padding: "14px 18px",
                                            }}
                                        >
                                            <span className="min-w-0">
                                                <span
                                                    className="block font-mono-field uppercase text-cw-clay"
                                                    style={{ fontSize: 10, letterSpacing: "0.22em" }}
                                                >
                                                    § New · Trip planner
                                                </span>
                                                <span
                                                    className="font-italic-serif italic"
                                                    style={{ fontSize: 19 }}
                                                >
                                                    Plan your ideal summer — a few trips across the season
                                                </span>
                                            </span>
                                            <span
                                                className="shrink-0 font-poster font-extrabold uppercase text-cw-forest"
                                                style={{ fontSize: 12, letterSpacing: "0.12em" }}
                                            >
                                                Open →
                                            </span>
                                        </Link>
                                    </div>

                                    <DashboardErrorBoundary section="Openings feed">
                                        <OpeningsFeed
                                            openingItems={openingItems}
                                            isMobile={isMobile}
                                            nowMs={nowMs}
                                            PAD={PAD}
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

            <AddCampgroundDialog open={addModalOpen} onClose={() => setAddModalOpen(false)} />
        </>
    );
}
