"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/top-bar";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { CampgroundsGroups } from "@/components/campgrounds-groups";
import { NotificationSubscribe } from "@/components/notification-subscribe";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import SiteSettingsContext from "@/context/site-settings";
import ProgressBarContext from "@/context/progress-bar";
import { Button } from "@/components/ui/button";
import { siteData } from "@/data/site-data";
import { getCampgroundOptions } from "@/data/sites";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { useColorMode } from "@/hooks/use-color-mode";
import { useAuth } from "@/hooks/use-auth";
import { clearCampgroundCache } from "@/lib/recreation-gov";
import type { SiteSettingsValue } from "@/context/site-settings";

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
    const [useMockData, setUseMockData] = useState(false);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);

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

    const { campgroundsByAreas, isFetching, progressBarData, refresh } =
        useCampgroundsData({
            siteConfig,
            settings,
            useMockData,
            enabled: !isHydrating,
        });

    const availableSites = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const c of campgroundsByAreas) {
            if (!c.id || !c.siteAvailability) continue;
            const names = Object.values(c.siteAvailability)
                .map((s) => s.siteName)
                .filter((n): n is string => !!n)
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            map[c.id] = Array.from(new Set(names));
        }
        return map;
    }, [campgroundsByAreas]);

    useEffect(() => {
        if (syncStatus === null) return;
        if (syncStatus === "success") {
            toast.success("Settings synced to notifications");
        } else {
            toast.warning("Settings saved locally but failed to sync");
        }
        clearSyncStatus();
    }, [syncStatus, clearSyncStatus]);

    const isLoading = isFetching || isHydrating;

    const refreshData = () => {
        refresh();
    };

    const topBarMenuItems = [
        { label: "Configure Sites", action: () => setIsConfigDialogOpen(true) },
        { label: isLoading ? "Refreshing…" : "Refresh data", action: refreshData, disabled: isLoading },
        {
            label: "Clear cache",
            action: () => {
                clearCampgroundCache();
                refresh();
            },
            disabled: isLoading,
        },
    ];

    return (
        <SiteSettingsContext.Provider value={settings}>
            <ProgressBarContext.Provider value={progressBarData}>
                <TopBar
                    title={siteData.name ?? ""}
                    subtitle={siteData.tagline ?? ""}
                    logo={{ src: "/images/logos/CampWatch_Logo_trimmed.png", alt: "Camp Watch logo", height: 36 }}
                    menuItems={topBarMenuItems}
                    isRefreshing={isLoading}
                    auth={auth}
                />
                <ProgressBarEl />

                <main className="container mx-auto p-5">
                    <CampgroundsGroups
                        campgrounds={campgroundsByAreas}
                        settings={settings as { views?: { type?: "calendar" | "table" } }}
                        isLoading={isLoading}
                    />

                    <footer className="mt-8 border-t pt-4">
                        <div className="space-y-3">
                            <NotificationSubscribe />
                            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-muted-foreground">
                                    {useMockData ? "Mock Recreation.gov data" : "Live Recreation.gov data"}
                                </p>
                                <ColorModeToggle />
                            </div>
                        </div>
                    </footer>
                </main>

                <SiteConfigDialog
                    open={isConfigDialogOpen}
                    onClose={() => setIsConfigDialogOpen(false)}
                    onSave={(config, nextGlobal) => {
                        void save(config, nextGlobal);
                        setIsConfigDialogOpen(false);
                    }}
                    onResetToDefaults={() => void cloneDefault()}
                    initialData={siteConfig}
                    catalogOptions={getCampgroundOptions()}
                    globalSettings={globalSettings}
                    availableSites={availableSites}
                    useMockData={useMockData}
                    onToggleMockData={(e) => setUseMockData(e.target.checked)}
                    useLocalConfig={false}
                    onToggleUseLocalConfig={() => {}}
                />
            </ProgressBarContext.Provider>
        </SiteSettingsContext.Provider>
    );
}

function ColorModeToggle() {
    const { mode, setMode } = useColorMode();
    return (
        <div className="inline-flex rounded-md border p-0.5">
            <Button
                variant={mode === "light" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("light")}
            >
                Light
            </Button>
            <Button
                variant={mode === "dark" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("dark")}
            >
                Dark
            </Button>
        </div>
    );
}
