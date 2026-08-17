"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripWindow } from "@/types/campground";

interface TripWindowsRecord {
    tripWindows: TripWindow[];
    updatedAt: string | null;
}

const ENDPOINT = "/api/users/me/trip-windows";

export interface UseTripWindowsState {
    tripWindows: TripWindow[];
    isLoading: boolean;
    syncStatus: "success" | "error" | null;
    syncError: string | null;
    clearSyncStatus: () => void;
    saveTripWindows: (windows: TripWindow[]) => Promise<void>;
}

export function useTripWindows(): UseTripWindowsState {
    const [record, setRecord] = useState<TripWindowsRecord>({ tripWindows: [], updatedAt: null });
    const [isLoading, setIsLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(ENDPOINT, { credentials: "include" });
                if (!r.ok) {
                    console.warn(`[useTripWindows] GET returned ${r.status}`);
                    return;
                }
                const data = (await r.json()) as TripWindowsRecord;
                if (!cancelled) setRecord(data);
            } catch (e) {
                console.warn("[useTripWindows] fetch failed:", e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const saveTripWindows = useCallback(async (windows: TripWindow[]) => {
        try {
            const r = await fetch(ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tripWindows: windows }),
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
            const stored = (await r.json()) as TripWindowsRecord;
            setRecord(stored);
            setSyncStatus("success");
        } catch {
            setSyncError(null);
            setSyncStatus("error");
        }
    }, []);

    return {
        tripWindows: record.tripWindows,
        isLoading,
        syncStatus,
        syncError,
        clearSyncStatus: () => {
            setSyncStatus(null);
            setSyncError(null);
        },
        saveTripWindows,
    };
}
