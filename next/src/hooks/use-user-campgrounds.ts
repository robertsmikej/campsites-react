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
    /** True when the last GET failed and `siteConfig` may be stale or empty.
     *  Callers must not treat an empty list as "new user" while this is set. */
    loadError: boolean;
    syncStatus: "success" | "error" | null;
    /** API-provided error message from the last failed save, if any. */
    syncError: string | null;
    isEmpty: boolean;
    /** The curator's default list, as fetched. Drives the "recently added"
     *  nudge and the lookup's "on our watch" detection. */
    defaultCampgrounds: Campground[];
    clearSyncStatus: () => void;
    /** Resolves true when the server accepted the write. */
    save: (config: SiteConfig, globalSettings: GlobalSettings) => Promise<boolean>;
    cloneDefault: () => Promise<boolean>;
    startBlank: () => Promise<boolean>;
    refresh: () => Promise<void>;
    /** Appends a single campground to the user's list and saves. Resolves true
     *  when the campground is on the list afterwards (already present counts). */
    addCampground: (campground: Campground) => Promise<boolean>;
    /** Adds every default campground the user doesn't already have, then marks
     *  the default as seen. Returns how many were added and whether the save
     *  succeeded. */
    addAllFromDefault: () => Promise<{ added: number; ok: boolean }>;
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

function isApiRecord(value: unknown): value is ApiRecord {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value as Partial<ApiRecord>;
    return typeof candidate.campgrounds === "object" && typeof candidate.globalSettings === "object";
}

// Every mounted instance of this hook (dashboard page, add dialog, lookup) keeps
// its own copy of the record. A write from one instance is broadcast with the
// stored record attached so the others adopt it without a refetch; a bare event
// (no detail) makes them refetch instead.
function broadcastWatchlistChange(stored: ApiRecord): void {
    if (typeof window === "undefined") {
        return;
    }
    window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGED_EVENT, { detail: stored }));
}

async function readErrorMessage(response: Response): Promise<string | null> {
    try {
        const body = (await response.json()) as { error?: string };
        return typeof body.error === "string" ? body.error : null;
    } catch {
        return null;
    }
}

export function useUserCampgrounds(): UseUserCampgroundsState {
    const [record, setRecord] = useState<ApiRecord>(emptyShape);
    const [isHydrating, setIsHydrating] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [defaultRecord, setDefaultRecord] = useState<DefaultRecord | null>(null);

    // On failure the last-good record is kept. Replacing it with the empty shape
    // made a transient 5xx (or an expired session) look like a brand-new user,
    // and the onboarding "use the curator's picks" then overwrote the real list.
    const refresh = useCallback(async () => {
        try {
            const r = await fetch(ENDPOINT, { credentials: "include" });
            if (!r.ok) {
                console.warn(`[useUserCampgrounds] GET returned ${r.status}`);
                setLoadError(true);
                return;
            }
            const data = (await r.json()) as ApiRecord;
            setRecord(data);
            setLoadError(false);
        } catch (e) {
            console.warn("[useUserCampgrounds] fetch failed:", e);
            setLoadError(true);
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

    useEffect(() => {
        const onWatchlistChanged = (event: Event) => {
            const detail = (event as CustomEvent<unknown>).detail;
            if (isApiRecord(detail)) {
                setRecord(detail);
                setLoadError(false);
                return;
            }
            void refresh();
        };
        window.addEventListener(WATCHLIST_CHANGED_EVENT, onWatchlistChanged);
        return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, onWatchlistChanged);
    }, [refresh]);

    const adoptStoredRecord = useCallback(
        (stored: ApiRecord) => {
            setRecord(stored);
            setLoadError(false);
            setSyncError(null);
            setSyncStatus("success");
            broadcastWatchlistChange(stored);
            // Re-fetch the default so defaultCampgrounds reflects any write-through
            // the server performed (curator saves update the default KV key).
            void fetchDefault();
        },
        [fetchDefault],
    );

    const save = useCallback(
        async (siteConfig: SiteConfig, globalSettings: GlobalSettings): Promise<boolean> => {
            try {
                const r = await fetch(ENDPOINT, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ campgrounds: siteConfig, globalSettings }),
                    credentials: "include",
                });
                if (!r.ok) {
                    setSyncError(await readErrorMessage(r));
                    setSyncStatus("error");
                    return false;
                }
                adoptStoredRecord((await r.json()) as ApiRecord);
                return true;
            } catch {
                setSyncError(null);
                setSyncStatus("error");
                return false;
            }
        },
        [adoptStoredRecord],
    );

    const cloneDefault = useCallback(async (): Promise<boolean> => {
        try {
            const r = await fetch(`${ENDPOINT}/clone-default`, {
                method: "POST",
                credentials: "include",
            });
            if (!r.ok) {
                setSyncStatus("error");
                return false;
            }
            adoptStoredRecord((await r.json()) as ApiRecord);
            return true;
        } catch {
            setSyncStatus("error");
            return false;
        }
    }, [adoptStoredRecord]);

    const startBlank = useCallback(async (): Promise<boolean> => {
        return save({ "recreation.gov": [] }, record.globalSettings);
    }, [record.globalSettings, save]);

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
        async (campground: Campground): Promise<boolean> => {
            const existing = record.campgrounds["recreation.gov"] ?? [];
            if (existing.some((c) => c.id === campground.id)) return true;
            const next: SiteConfig = {
                ...record.campgrounds,
                "recreation.gov": [...existing, campground],
            };
            return save(next, record.globalSettings);
        },
        [record, save],
    );

    const addAllFromDefault = useCallback(async (): Promise<{ added: number; ok: boolean }> => {
        const existing = record.campgrounds["recreation.gov"] ?? [];
        const existingIds = new Set(existing.map((c) => c.id).filter(Boolean));
        const toAdd = defaultCampgrounds.filter((c) => c.id && !existingIds.has(c.id));
        let ok = true;
        if (toAdd.length > 0) {
            const next: SiteConfig = {
                ...record.campgrounds,
                "recreation.gov": [...existing, ...toAdd],
            };
            ok = await save(next, record.globalSettings);
        }
        await markDefaultSeen();
        return { added: ok ? toAdd.length : 0, ok };
    }, [defaultCampgrounds, record, save, markDefaultSeen]);

    const dismissRecentlyAdded = useCallback(async () => {
        await markDefaultSeen();
    }, [markDefaultSeen]);

    return {
        siteConfig: record.campgrounds,
        globalSettings: record.globalSettings,
        updatedAt: record.updatedAt,
        isHydrating,
        loadError,
        syncStatus,
        syncError,
        isEmpty:
            !loadError &&
            record.updatedAt === null &&
            (record.campgrounds["recreation.gov"]?.length ?? 0) === 0,
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
