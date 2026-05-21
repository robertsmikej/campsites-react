"use client";

import { useState, useEffect, useCallback } from "react";

export interface RecentOpening {
    signature: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName: string;
    from: string;
    to: string;
    nights: number;
    detectedAt: string;
}

export function useRecentOpenings(): RecentOpening[] {
    const [openings, setOpenings] = useState<RecentOpening[]>([]);

    const load = useCallback(async () => {
        try {
            const resp = await fetch("/api/openings/recent");
            if (resp.ok) {
                const data = (await resp.json()) as RecentOpening[];
                setOpenings(Array.isArray(data) ? data : []);
            }
        } catch {
            // silently ignore — empty list is fine
        }
    }, []);

    useEffect(() => {
        void load();
        const onFocus = () => void load();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [load]);

    return openings;
}
