"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Lazily fetches a recreation.gov campground's site-label roster (one fetch per
 * id per mount) and exposes the results by campground id. Used by the configure
 * dialog to populate the site multi-select only for campgrounds you actually open.
 */
export function useCampgroundSites() {
    const [sitesById, setSitesById] = useState<Record<string, string[]>>({});
    const requested = useRef<Set<string>>(new Set());

    const ensureLoaded = useCallback((id: string | undefined) => {
        if (!id || !/^\d+$/.test(id) || requested.current.has(id)) return;
        requested.current.add(id);
        void (async () => {
            try {
                const r = await fetch(`/api/campgrounds/${id}/sites`, { credentials: "include" });
                if (!r.ok) {
                    requested.current.delete(id); // allow a later retry
                    return;
                }
                const data = (await r.json()) as { sites?: string[] };
                setSitesById((cur) => ({ ...cur, [id]: data.sites ?? [] }));
            } catch {
                requested.current.delete(id);
            }
        })();
    }, []);

    return { sitesById, ensureLoaded };
}
