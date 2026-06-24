"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { WatchlistSection } from "@/components/dashboard/watchlist-section";
import ProgressBarContext from "@/contexts/progress-bar";
import SiteSettingsContext from "@/contexts/site-settings";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { getCampgroundOpenCount } from "@/components/campground/get-open-count";
import type { SiteSettingsValue } from "@/contexts/site-settings";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

interface DefaultRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

// 42-day window from today (same as dashboard default)
function makeWindow(maxEnd?: Date) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 120);
    // Clamp to the latest season-end across the displayed campgrounds so we
    // don't render dead ticks past the last bookable day.
    if (maxEnd && maxEnd < end) {
        return { start, end: maxEnd };
    }
    return { start, end };
}

export function DiscoverClient() {
    const auth = useAuth();
    const isMobile = useIsMobile();
    const [defaultRecord, setDefaultRecord] = useState<DefaultRecord | null>(null);

    useEffect(() => {
        fetch("/api/default")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: unknown) => setDefaultRecord(data as DefaultRecord | null))
            .catch(() => {});
    }, []);

    const globalSettings = defaultRecord?.globalSettings ?? DEFAULT_GLOBAL_SETTINGS;

    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
                blackoutDates: globalSettings.blackoutDates,
            },
            views: { type: "calendar" as const },
            dev: { useMockData: false },
        }),
        [globalSettings],
    );

    const { campgroundsByAreas, isFetching, progressBarData } = useCampgroundsData({
        enabled: true,
    });

    // Sort alphabetically for stable display on the public page
    const sortedCampgrounds = useMemo(
        () => [...campgroundsByAreas].sort((a, b) => a.name.localeCompare(b.name)),
        [campgroundsByAreas],
    );

    const dateRange = useMemo(() => {
        let latest: Date | null = null;
        for (const cg of sortedCampgrounds) {
            const iso = cg.dates?.endDate;
            if (!iso) continue;
            const d = new Date(iso + "T00:00:00");
            if (!latest || d > latest) latest = d;
        }
        return makeWindow(latest ?? undefined);
    }, [sortedCampgrounds]);

    const openCounts = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of sortedCampgrounds) {
            m.set(c.id ?? c.name, getCampgroundOpenCount(c, dateRange.start, dateRange.end));
        }
        return m;
    }, [sortedCampgrounds, dateRange]);

    const PAD = isMobile ? 22 : 36;

    return (
        <SiteSettingsContext.Provider value={settings}>
            <ProgressBarContext.Provider value={progressBarData}>
                <DashboardTopBar auth={auth} />

                <main className="bg-cw-paper text-cw-ink font-body-serif min-h-screen">
                    <div className="mx-auto w-full max-w-screen-2xl">
                        {/* Sign-in nudge banner */}
                        {!auth.isLoading && !auth.user && (
                            <div className="rounded-md border border-cw-clay/40 bg-cw-mustard/10 px-4 py-3 mb-6 mx-[22px] md:mx-9 mt-5 flex flex-wrap items-center justify-between gap-3">
                                <p className="font-body-serif text-[14px] text-cw-ink">
                                    Browsing the curator&apos;s list.{" "}
                                    <span className="font-italic-serif italic">
                                        Sign in to start your own watchlist.
                                    </span>
                                </p>
                                <a
                                    href="/auth/google/start?returnTo=/app"
                                    className="font-mono-field text-[13px] font-bold uppercase tracking-[0.14em] px-[13px] py-[9px] rounded-[2px] no-underline"
                                    style={{ background: "var(--cw-ink)", color: "var(--cw-cream)" }}
                                >
                                    Sign in with Google →
                                </a>
                            </div>
                        )}

                        {/* Page header */}
                        <div className="px-[22px] md:px-9 pt-6 pb-4">
                            <div className="font-mono-field text-[13px] font-bold uppercase tracking-[0.18em] text-cw-clay mb-2">
                                Picks · Curator&apos;s list
                            </div>
                            <h1 className="font-poster text-[36px] sm:text-[44px] font-black uppercase leading-[0.95] m-0">
                                Campgrounds we watch
                            </h1>
                            <p className="font-italic-serif italic text-[18px] sm:text-[22px] mt-2 text-cw-ink-soft">
                                The curator&apos;s list is a hand-picked starter set — add any to your own
                                watchlist, or paste a recreation.gov URL.
                            </p>
                        </div>

                        {/* Watchlist in read-only mode */}
                        <WatchlistSection
                            campgroundsByAreas={sortedCampgrounds}
                            openCounts={openCounts}
                            isLoading={isFetching && sortedCampgrounds.length === 0}
                            dateRange={dateRange}
                            calRange={undefined}
                            datePickerOpen={false}
                            setDatePickerOpen={() => {}}
                            handleCalSelect={() => {}}
                            favorites={new Set()}
                            onToggleFavorite={() => {}}
                            settings={settings as { views?: { type?: "calendar" | "table" } }}
                            globalSettings={globalSettings}
                            isMobile={isMobile}
                            readOnly
                            showControls={false}
                            PAD={PAD}
                        />

                        {/* Footer */}
                        <footer className="px-[22px] md:px-9 pt-5 pb-9 flex justify-between font-mono-field text-[13px] font-medium leading-none tracking-[0.12em] text-cw-ink-faint uppercase flex-wrap gap-2">
                            <span>Built by a camper, for campers</span>
                            <span>CampWatch</span>
                        </footer>
                    </div>
                </main>
            </ProgressBarContext.Provider>
        </SiteSettingsContext.Provider>
    );
}
