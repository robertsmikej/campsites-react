"use client";

import { useCallback, useEffect, useState } from "react";
import type { SiteConfig, GlobalSettings } from "@/types/campground";

interface ApiRecord {
    campgrounds: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string | null;
}

const ENDPOINT = "/api/users/me/campgrounds";

export interface UseUserCampgroundsState {
    siteConfig: SiteConfig;
    globalSettings: GlobalSettings;
    updatedAt: string | null;
    isHydrating: boolean;
    syncStatus: "success" | "error" | null;
    isEmpty: boolean;
    clearSyncStatus: () => void;
    save: (config: SiteConfig, globalSettings: GlobalSettings) => Promise<void>;
    cloneDefault: () => Promise<void>;
    startBlank: () => Promise<void>;
    refresh: () => Promise<void>;
}

function emptyShape(): ApiRecord {
    return {
        campgrounds: { "recreation.gov": [] },
        globalSettings: {
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
        },
        updatedAt: null,
    };
}

export function useUserCampgrounds(): UseUserCampgroundsState {
    const [record, setRecord] = useState<ApiRecord>(emptyShape);
    const [isHydrating, setIsHydrating] = useState(true);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);

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

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const save = useCallback(async (siteConfig: SiteConfig, globalSettings: GlobalSettings) => {
        try {
            const r = await fetch(ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campgrounds: siteConfig, globalSettings }),
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

    return {
        siteConfig: record.campgrounds,
        globalSettings: record.globalSettings,
        updatedAt: record.updatedAt,
        isHydrating,
        syncStatus,
        isEmpty:
            record.updatedAt === null &&
            (record.campgrounds["recreation.gov"]?.length ?? 0) === 0,
        clearSyncStatus: () => setSyncStatus(null),
        save,
        cloneDefault,
        startBlank,
        refresh,
    };
}
