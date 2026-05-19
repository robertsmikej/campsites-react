"use client";

import { useEffect, useState } from "react";

export interface CampgroundDetails {
    facilityId: string;
    name: string | null;
    previewImageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
}

// Module-level cache dedupes fetches across components within a session.
// Cross-session caching is handled by KV in the API route.
const cache = new Map<string, CampgroundDetails | null>();

export function useCampgroundDetails(facilityId: string | undefined): CampgroundDetails | null {
    const [details, setDetails] = useState<CampgroundDetails | null>(() => {
        if (!facilityId) return null;
        return cache.get(facilityId) ?? null;
    });

    useEffect(() => {
        if (!facilityId) return;
        if (cache.has(facilityId)) {
            setDetails(cache.get(facilityId)!);
            return;
        }
        let cancelled = false;
        fetch(`/api/campgrounds/${facilityId}/details`)
            .then((r) => (r.ok ? r.json() as Promise<CampgroundDetails> : null))
            .then((data) => {
                if (cancelled) return;
                cache.set(facilityId, data ?? null);
                setDetails(data ?? null);
            })
            .catch(() => {
                if (cancelled) return;
                cache.set(facilityId, null);
            });
        return () => {
            cancelled = true;
        };
    }, [facilityId]);

    return details;
}
