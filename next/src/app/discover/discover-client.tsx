"use client";

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/top-bar";
import { CampgroundsList } from "@/components/campgrounds-list";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { useAuth } from "@/hooks/use-auth";
import { siteData } from "@/data/site-data";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import SiteSettingsContext from "@/context/site-settings";
import ProgressBarContext from "@/context/progress-bar";
import type { SiteSettingsValue } from "@/context/site-settings";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

interface DefaultRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    stayLengths: [2, 3, 4, 5],
    validStartDays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ],
};

const EMPTY_SITE_CONFIG: SiteConfig = { "recreation.gov": [] };

export function DiscoverClient() {
    const auth = useAuth();
    const [defaultRecord, setDefaultRecord] = useState<DefaultRecord | null>(null);

    useEffect(() => {
        fetch("/api/default")
            .then((r) => (r.ok ? r.json() : null))
            .then((data: unknown) => setDefaultRecord(data as DefaultRecord | null))
            .catch(() => {});
    }, []);

    const siteConfig = defaultRecord?.campgrounds ?? EMPTY_SITE_CONFIG;
    const globalSettings = defaultRecord?.globalSettings ?? DEFAULT_GLOBAL_SETTINGS;

    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
            },
            views: { type: "calendar" as const },
            dev: { useMockData: false },
        }),
        [globalSettings],
    );

    const { campgroundsByAreas, isFetching, progressBarData } = useCampgroundsData({
        siteConfig,
        settings,
        useMockData: false,
        enabled: defaultRecord !== null,
    });

    return (
        <SiteSettingsContext.Provider value={settings}>
            <ProgressBarContext.Provider value={progressBarData}>
                <TopBar
                    title={siteData.name ?? ""}
                    subtitle="Curator's list"
                    logo={{
                        src: "/images/logos/CampWatch_Logo_trimmed.png",
                        alt: "Camp Watch logo",
                        height: 36,
                    }}
                    auth={auth}
                />
                <ProgressBarEl />
                <main className="container mx-auto p-5">
                    {/* Sign-in nudge banner */}
                    {!auth.isLoading && !auth.user && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                            <p>
                                Browsing the curator&apos;s list. Sign in to start your own watchlist.
                            </p>
                            <a
                                href="/auth/google/start?returnTo=/app"
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                            >
                                Sign in with Google →
                            </a>
                        </div>
                    )}
                    <CampgroundsList
                        campgrounds={campgroundsByAreas}
                        settings={settings as { views?: { type?: "calendar" | "table" } }}
                        isLoading={isFetching && campgroundsByAreas.length === 0}
                        readOnly
                        globalSettings={globalSettings}
                    />
                </main>
            </ProgressBarContext.Provider>
        </SiteSettingsContext.Provider>
    );
}
