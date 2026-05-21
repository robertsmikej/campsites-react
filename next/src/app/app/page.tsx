"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import SiteSettingsContext from "@/context/site-settings";
import ProgressBarContext from "@/context/progress-bar";
import { Button } from "@/components/ui/button";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { useAuth } from "@/hooks/use-auth";
import { clearCampgroundCache } from "@/lib/recreation-gov";
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
import type { SiteSettingsValue } from "@/context/site-settings";
import type { OpeningItem } from "@/components/dashboard/openings-feed";
import type { GroupBy } from "@/hooks/use-dashboard-prefs";

export default function AppPage() {
    const auth = useAuth();
    const userCampgrounds = useUserCampgrounds();
    const {
        siteConfig,
        globalSettings,
        isHydrating,
        syncStatus,
        clearSyncStatus,
        save,
        cloneDefault,
    } = userCampgrounds;

    const isMobile = useIsMobile();
    const [useMockData] = useState(false);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [focusedCampgroundId, setFocusedCampgroundId] = useState<string | null>(null);
    const [dismissedSync, setDismissedSync] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);

    // Dashboard preferences (date range + grouping) — single persisted blob.
    const {
        dateRange,
        calRange,
        datePickerOpen,
        setDatePickerOpen,
        handleCalSelect,
        groupBy,
        setGroupBy,
    } = useDashboardPrefs();
    const handleGroupBy = setGroupBy;

    // Favorites
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const raw = localStorage.getItem("campwatch:favorites");
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
        } catch { return new Set(); }
    });
    const toggleFavorite = (id: string) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            writeStorage("campwatch:favorites", Array.from(next));
            return next;
        });
    };

    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
            },
            views: { type: "calendar" as const },
            dev: { useMockData },
        }),
        [globalSettings, useMockData],
    );

    const { campgroundsByAreas, isFetching, progressBarData, refresh } = useCampgroundsData({
        siteConfig,
        settings,
        useMockData,
        enabled: !isHydrating,
    });

    // Rating change handler
    const handleRatingChange = useCallback((
        campgroundId: string,
        siteName: string,
        newRating: "favorite" | "worthwhile" | "unrated",
    ) => {
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
    }, [siteConfig, globalSettings, save]);

    useEffect(() => {
        if (syncStatus === null) return;
        if (syncStatus === "success") { toast.success("Settings synced to notifications"); }
        else { toast.warning("Settings saved locally but failed to sync"); }
        clearSyncStatus();
    }, [syncStatus, clearSyncStatus]);

    const isLoading = isFetching || isHydrating;
    const isEmpty = !userCampgrounds.isHydrating && userCampgrounds.isEmpty;

    const topBarMenuItems = [
        { label: "Configure Sites", action: () => setIsConfigDialogOpen(true) },
        { label: isLoading ? "Refreshing…" : "Refresh data", action: () => refresh(), disabled: isLoading },
        { label: "Clear cache", action: () => { clearCampgroundCache(); refresh(); }, disabled: isLoading },
    ];

    // Compute open counts within date range
    const openCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of campgroundsByAreas) {
            m.set(c.id ?? c.name, getCampgroundOpenCount(c, dateRange.start, dateRange.end));
        }
        return m;
    }, [campgroundsByAreas, dateRange]);

    const campgroundsWithOpenings = useMemo(() =>
        campgroundsByAreas.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) > 0).length,
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

    const openingItems = useMemo((): OpeningItem[] => {
        const winStartIso = toLocalIso(dateRange.start);
        const winEndIso = toLocalIso(dateRange.end);

        const items: OpeningItem[] = recentOpenings
            .filter((r) => {
                if (!userCampgroundIds.has(r.campgroundId)) return false;
                if (r.to <= winStartIso || r.from > winEndIso) return false;
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
    }, [recentOpenings, userCampgroundIds, dateRange]);

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
                        isLoading={isLoading}
                        menuItems={topBarMenuItems}
                        onAddCampground={() => setAddModalOpen(true)}
                    />

                    <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">

                        {/* Missing-from-default sync banner */}
                        {userCampgrounds.missingFromDefault.length > 0 && !dismissedSync && (
                            <div className="px-[22px] py-3 md:px-9">
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                                    <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                            {userCampgrounds.missingFromDefault.length} new campground{userCampgrounds.missingFromDefault.length === 1 ? "" : "s"} in the default config
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {userCampgrounds.missingFromDefault.map((c) => c.name).join(", ")}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button size="sm" onClick={async () => {
                                            const result = await userCampgrounds.syncMissing();
                                            setDismissedSync(true);
                                            toast.success(`Added ${result.added} campground${result.added === 1 ? "" : "s"}`);
                                        }}>
                                            Add to my list
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => setDismissedSync(true)} aria-label="Dismiss">
                                            <X className="size-4" />
                                        </Button>
                                    </div>
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
                                        groupBy={groupBy}
                                        onGroupBy={handleGroupBy}
                                        dateRange={dateRange}
                                        calRange={calRange}
                                        datePickerOpen={datePickerOpen}
                                        setDatePickerOpen={setDatePickerOpen}
                                        handleCalSelect={handleCalSelect}
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
                        <footer className="px-[22px] md:px-9 pt-5 pb-9 flex justify-between font-mono-field text-[11px] font-medium leading-none tracking-[0.12em] text-cw-ink-faint uppercase flex-wrap gap-2">
                            <span>Built by a camper, for campers</span>
                            <span>{siteData.name}</span>
                        </footer>
                    </main>

                    <SiteConfigDialog
                        open={isConfigDialogOpen}
                        onClose={() => { setIsConfigDialogOpen(false); setFocusedCampgroundId(null); }}
                        onSave={(config, nextGlobal) => { void save(config, nextGlobal); setIsConfigDialogOpen(false); setFocusedCampgroundId(null); }}
                        onResetToDefaults={() => void cloneDefault()}
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
