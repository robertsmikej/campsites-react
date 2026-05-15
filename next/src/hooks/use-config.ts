"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiConfigResponse, GlobalSettings, SiteConfig } from "@/types/campground";
import { sites as defaultSites } from "@/data/sites";

const USER_SITES_STORAGE_KEY = "campsites-react-user-sites";
const USE_LOCAL_CONFIG_KEY = "campsites-react-use-local-config";

function cloneConfig(c: SiteConfig): SiteConfig {
    return JSON.parse(JSON.stringify(c)) as SiteConfig;
}

async function fetchRemoteConfig(): Promise<ApiConfigResponse | null> {
    const configKey = process.env.NEXT_PUBLIC_CONFIG_KEY || "";
    const headers: Record<string, string> = {};
    if (configKey) headers.Authorization = `Bearer ${configKey}`;
    try {
        const response = await fetch("/api/config", { headers });
        if (!response.ok) {
            if (response.status !== 404) {
                console.error(`[Config Load] API returned ${response.status}`);
            }
            return null;
        }
        const data = (await response.json()) as Partial<ApiConfigResponse>;
        if (!data?.campgrounds) return null;
        return data as ApiConfigResponse;
    } catch (e) {
        console.error("[Config Load] failed:", e);
        return null;
    }
}

async function pushRemoteConfig(
    config: SiteConfig,
    globalSettings: GlobalSettings,
): Promise<{ ok: boolean }> {
    const configKey = process.env.NEXT_PUBLIC_CONFIG_KEY || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (configKey) headers.Authorization = `Bearer ${configKey}`;
    try {
        const response = await fetch("/api/config", {
            method: "PUT",
            headers,
            body: JSON.stringify({ campgrounds: config, globalSettings }),
        });
        return { ok: response.ok };
    } catch (e) {
        console.error("[Config Sync] failed:", e);
        return { ok: false };
    }
}

function loadInitialUseLocalConfig(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(USE_LOCAL_CONFIG_KEY) === "true";
    } catch {
        return false;
    }
}

export function useConfig(initialGlobalSettings: GlobalSettings) {
    const [siteConfig, setSiteConfig] = useState<SiteConfig>(() => cloneConfig(defaultSites));
    const [useLocalConfig, setUseLocalConfigState] = useState<boolean>(() => loadInitialUseLocalConfig());
    const [isHydrating, setIsHydrating] = useState(true);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadLocal = (): boolean => {
            try {
                const raw = window.localStorage.getItem(USER_SITES_STORAGE_KEY);
                if (!raw) return false;
                const parsed = JSON.parse(raw) as SiteConfig;
                if (!cancelled) setSiteConfig(parsed);
                return true;
            } catch {
                return false;
            }
        };

        async function hydrate() {
            setIsHydrating(true);
            if (useLocalConfig) {
                loadLocal();
            } else {
                const remote = await fetchRemoteConfig();
                if (cancelled) return;
                if (remote?.campgrounds) {
                    setSiteConfig(remote.campgrounds);
                } else if (!loadLocal()) {
                    // fall through to defaults
                }
            }
            if (!cancelled) setIsHydrating(false);
        }

        if (typeof window === "undefined") {
            setIsHydrating(false);
        } else {
            hydrate();
        }

        return () => {
            cancelled = true;
        };
    }, [useLocalConfig]);

    const save = useCallback(
        (next: SiteConfig, nextGlobal: GlobalSettings) => {
            const cloned = cloneConfig(next);
            setSiteConfig(cloned);
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.setItem(USER_SITES_STORAGE_KEY, JSON.stringify(cloned));
                } catch {
                    // ignore
                }
            }
            if (!useLocalConfig) {
                pushRemoteConfig(cloned, nextGlobal).then(({ ok }) =>
                    setSyncStatus(ok ? "success" : "error"),
                );
            }
        },
        [useLocalConfig],
    );

    const resetToDefaults = useCallback(() => {
        const defaults = cloneConfig(defaultSites);
        setSiteConfig(defaults);
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem(USER_SITES_STORAGE_KEY);
            } catch {
                // ignore
            }
        }
        if (!useLocalConfig) {
            pushRemoteConfig(defaults, initialGlobalSettings).then(({ ok }) =>
                setSyncStatus(ok ? "success" : "error"),
            );
        }
    }, [useLocalConfig, initialGlobalSettings]);

    const setUseLocalConfig = useCallback((next: boolean) => {
        setUseLocalConfigState(next);
        if (typeof window !== "undefined") {
            try {
                window.localStorage.setItem(USE_LOCAL_CONFIG_KEY, String(next));
            } catch {
                // ignore
            }
        }
    }, []);

    return {
        siteConfig,
        setSiteConfig,
        useLocalConfig,
        setUseLocalConfig,
        isHydrating,
        syncStatus,
        clearSyncStatus: () => setSyncStatus(null),
        save,
        resetToDefaults,
    };
}
