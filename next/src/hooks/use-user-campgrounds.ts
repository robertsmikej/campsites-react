"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WATCHLIST_CHANGED_EVENT } from "@/lib/events";
import type { SiteConfig, GlobalSettings, Campground } from "@/types/campground";

interface ApiRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string | null;
}

interface DefaultRecord {
    campgrounds?: SiteConfig;
    globalSettings?: GlobalSettings;
}

const ENDPOINT = "/api/users/me/campgrounds";
const DEFAULT_ENDPOINT = "/api/default";

export interface UseUserCampgroundsState {
    siteConfig: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string | null;
    isHydrating: boolean;
    syncStatus: "success" | "error" | null;
    /** API-provided error message from the last failed save, if any. */
    syncError: string | null;
    isEmpty: boolean;
    /** The curator's default list, as fetched. Drives the "recently added"
     *  nudge and the lookup's "on our watch" detection. */
    defaultCampgrounds: Campground[];
    clearSyncStatus: () => void;
    save: (config: SiteConfig, globalSettings: GlobalSettings) => Promise<void>;
    cloneDefault: () => Promise<void>;
    startBlank: () => Promise<void>;
    refresh: () => Promise<void>;
    /** Appends a single campground to the user's list and saves. No-op if the
     *  id is already present. */
    addCampground: (campground: Campground) => Promise<void>;
    /** Adds every default campground the user doesn't already have, then marks
     *  the default as seen. Returns how many were added. */
    addAllFromDefault: () => Promise<{ added: number }>;
    /** Marks the curator's default as seen as of now (dismisses the nudge). */
    dismissRecentlyAdded: () => Promise<void>;
}

function emptyShape(): ApiRecord {
    return {
        campgrounds: { "recreation.gov": [] },
        globalSettings: {
            stayLengths: [2, 3, 4, 5],
            validStartDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        },
        updatedAt: null,
    };
}

export function useUserCampgrounds(): UseUserCampgroundsState {
    const [record, setRecord] = useState<ApiRecord>(emptyShape);
    const [isHydrating, setIsHydrating] = useState(true);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [defaultRecord, setDefaultRecord] = useState<DefaultRecord | null>(null);

    const refresh = useCallback(async () => {
        try {
            const r = await fetch(ENDPOINT, { credentials: "include" });
            if (!r.ok) {
                console.warn(`[useUserCampgrounds] GET returned ${r.status}`);
                setRecord(emptyShape());
                return;
            }
            const data = (await r.json()) as ApiRecord;
            setRecord(data);
        } catch (e) {
            console.warn("[useUserCampgrounds] fetch failed:", e);
            setRecord(emptyShape());
        } finally {
            setIsHydrating(false);
        }
    }, []);

    const fetchDefault = useCallback(async () => {
        try {
            const r = await fetch(DEFAULT_ENDPOINT, { credentials: "include" });
            if (!r.ok) return;
            const data = (await r.json()) as DefaultRecord;
            setDefaultRecord(data);
        } catch (e) {
            console.warn("[useUserCampgrounds] default fetch failed:", e);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        void fetchDefault();
    }, [fetchDefault]);

    const save = useCallback(
        async (siteConfig: SiteConfig, globalSettings: GlobalSettings) => {
            try {
                const r = await fetch(ENDPOINT, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ campgrounds: siteConfig, globalSettings }),
                    credentials: "include",
                });
                if (!r.ok) {
                    let message: string | null = null;
                    try {
                        const body = (await r.json()) as { error?: string };
                        if (typeof body.error === "string") message = body.error;
                    } catch {
                        // ignore parse failure
                    }
                    setSyncError(message);
                    setSyncStatus("error");
                    return;
                }
                setSyncError(null);
                const stored = (await r.json()) as ApiRecord;
                setRecord(stored);
                setSyncStatus("success");
                // Tell the dashboard's availability data to refetch so a newly
                // added campground's site data shows without a manual reload.
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT));
                }
                // Re-fetch the default so defaultCampgrounds reflects any write-through
                // the server performed (curator saves update the default KV key).
                void fetchDefault();
            } catch {
                setSyncError(null);
                setSyncStatus("error");
            }
        },
        [fetchDefault],
    );

    const cloneDefault = useCallback(async () => {
        try {
            const r = await fetch(`${ENDPOINT}/clone-default`, {
                method: "POST",
                credentials: "include",
            });
            if (!r.ok) {
                setSyncStatus("error");
                return;
            }
            const stored = (await r.json()) as ApiRecord;
            setRecord(stored);
            setSyncStatus("success");
        } catch {
            setSyncStatus("error");
        }
    }, []);

    const startBlank = useCallback(async () => {
        try {
            const r = await fetch(ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campgrounds: { "recreation.gov": [] },
                    globalSettings: record.globalSettings,
                }),
                credentials: "include",
            });
            if (!r.ok) {
                setSyncStatus("error");
                return;
            }
            const stored = (await r.json()) as ApiRecord;
            setRecord(stored);
            setSyncStatus("success");
        } catch {
            setSyncStatus("error");
        }
    }, [record.globalSettings]);

    const defaultCampgrounds = useMemo<Campground[]>(
        () => defaultRecord?.campgrounds?.["recreation.gov"] ?? [],
        [defaultRecord],
    );

    // POST that marks the curator's default as seen (server stamps the time).
    const markDefaultSeen = useCallback(async () => {
        try {
            await fetch("/api/users/me/seen-default", { method: "POST", credentials: "include" });
        } catch (e) {
            console.warn("[useUserCampgrounds] seen-default failed:", e);
        }
    }, []);

    const addCampground = useCallback(
        async (campground: Campground) => {
            const existing = record.campgrounds["recreation.gov"] ?? [];
            if (existing.some((c) => c.id === campground.id)) return;
            const next: SiteConfig = {
                ...record.campgrounds,
                "recreation.gov": [...existing, campground],
            };
            await save(next, record.globalSettings);
        },
        [record, save],
    );

    const addAllFromDefault = useCallback(async (): Promise<{ added: number }> => {
        const existing = record.campgrounds["recreation.gov"] ?? [];
        const existingIds = new Set(existing.map((c) => c.id).filter(Boolean));
        const toAdd = defaultCampgrounds.filter((c) => c.id && !existingIds.has(c.id));
        if (toAdd.length > 0) {
            const next: SiteConfig = {
                ...record.campgrounds,
                "recreation.gov": [...existing, ...toAdd],
            };
            await save(next, record.globalSettings);
        }
        await markDefaultSeen();
        return { added: toAdd.length };
    }, [defaultCampgrounds, record, save, markDefaultSeen]);

    const dismissRecentlyAdded = useCallback(async () => {
        await markDefaultSeen();
    }, [markDefaultSeen]);

    return {
        siteConfig: record.campgrounds,
        globalSettings: record.globalSettings,
        updatedAt: record.updatedAt,
        isHydrating,
        syncStatus,
        syncError,
        isEmpty: record.updatedAt === null && (record.campgrounds["recreation.gov"]?.length ?? 0) === 0,
        defaultCampgrounds,
        clearSyncStatus: () => {
            setSyncStatus(null);
            setSyncError(null);
        },
        save,
        cloneDefault,
        startBlank,
        refresh,
        addCampground,
        addAllFromDefault,
        dismissRecentlyAdded,
    };
}
