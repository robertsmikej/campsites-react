"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SiteConfig, GlobalSettings } from "@/types/campground";
import { restoreCampground, type ArchivedCampground } from "@/lib/campground-archive";
import { useAuth } from "@/hooks/use-auth";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { SearchResult } from "@/app/api/campgrounds/search/route";
import { parseInput, looksLikeUrlAttempt, buildNewCampground } from "./parse-input";
import type { LookupResult } from "./types";

// All state, data-fetching, and handlers shared by both lookup variants. Each
// variant component calls this once and renders its own layout from the result.
export function useCampgroundLookup({
    variant,
    initialQuery,
}: {
    variant: "homepage" | "dashboard";
    initialQuery?: string;
}) {
    const isDashboard = variant === "dashboard";
    const auth = useAuth();
    const userCampgrounds = useUserCampgrounds();
    const isMobile = useIsMobile();

    const [value, setValue] = useState("");
    const [touched, setTouched] = useState(false);
    const [fetchedResult, setFetchedResult] = useState<LookupResult | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [adding, setAdding] = useState(false);
    const [addedSuccess, setAddedSuccess] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [archive, setArchive] = useState<ArchivedCampground[]>([]);

    // Previously-watched archive (dashboard variant only).
    useEffect(() => {
        if (!isDashboard) return;
        let cancelled = false;
        void (async () => {
            try {
                const r = await fetch("/api/users/me/campgrounds/archive", { credentials: "include" });
                if (!r.ok) return;
                const data = (await r.json()) as { campgrounds: ArchivedCampground[] };
                if (!cancelled) setArchive(data.campgrounds ?? []);
            } catch {
                // Best-effort — the section just doesn't render.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isDashboard]);

    const activeIds = useMemo(
        () => new Set((userCampgrounds.siteConfig["recreation.gov"] ?? []).map((c) => c.id)),
        [userCampgrounds.siteConfig],
    );
    const previouslyWatched = archive.filter((a) => !activeIds.has(a.id));

    const handleReadd = useCallback(
        async (entry: ArchivedCampground) => {
            const existing = userCampgrounds.siteConfig["recreation.gov"] ?? [];
            const nextConfig: SiteConfig = {
                ...userCampgrounds.siteConfig,
                "recreation.gov": [...existing, restoreCampground(entry)],
            };
            setAdding(true);
            try {
                await userCampgrounds.save(nextConfig, userCampgrounds.globalSettings);
            } finally {
                setAdding(false);
            }
        },
        [userCampgrounds],
    );

    const signedIn = !auth.isLoading && auth.user != null;

    // Check user's list and default list (in-memory, no network)
    const resolve = useCallback(
        (id: string): LookupResult | null => {
            if (userCampgrounds.isHydrating) return null; // still loading

            const userList = userCampgrounds.siteConfig["recreation.gov"] ?? [];
            const userMatch = userList.find((c) => c.id === id);
            if (userMatch) {
                return { state: "on-list", parsedId: id, cg: { id, name: userMatch.name } };
            }

            // On the curator's default list but not the user's own → "on our watch".
            const inDefault = userCampgrounds.defaultCampgrounds.find((c) => c.id === id);
            if (inDefault) {
                return { state: "watched", parsedId: id, cg: { id, name: inDefault.name } };
            }

            return null; // not in memory — need a network call
        },
        [userCampgrounds],
    );

    // Compute result reactively when value changes (in-memory checks only)
    const memoryResult = useMemo<LookupResult | null>(() => {
        if (!touched || !value.trim()) return null;
        const id = parseInput(value);
        if (!id) return { state: "invalid" };
        return resolve(id);
    }, [touched, value, resolve]);

    // The displayed result: prefer fetchedResult for network states, else memory
    const displayResult = fetchedResult ?? memoryResult;
    const isLoading =
        isFetching || (touched && value.trim() && memoryResult === null && !fetchedResult && auth.isLoading);

    const doLookup = useCallback(
        async (raw?: string) => {
            const input = (raw ?? value).trim();
            if (!input) return;
            const id = parseInput(input);
            if (!id) {
                if (looksLikeUrlAttempt(input)) {
                    setFetchedResult({ state: "invalid" });
                    setSearchResults(null);
                    return;
                }
                setFetchedResult(null);
                setSearchResults(null);
                setAddedSuccess(false);
                setIsSearching(true);
                try {
                    const resp = await fetch(`/api/campgrounds/search?q=${encodeURIComponent(input)}`);
                    if (resp.ok) {
                        const data = (await resp.json()) as SearchResult[];
                        setSearchResults(Array.isArray(data) ? data : []);
                    } else {
                        setSearchResults([]);
                    }
                } catch {
                    setSearchResults([]);
                } finally {
                    setIsSearching(false);
                }
                return;
            }
            setSearchResults(null);
            const mem = resolve(id);
            if (mem) {
                setFetchedResult(null);
                return;
            }
            setIsFetching(true);
            setFetchedResult(null);
            setAddedSuccess(false);
            try {
                const resp = await fetch(`/api/campgrounds/${id}/details`);
                if (!resp.ok) {
                    setFetchedResult({ state: "not-found", parsedId: id });
                    return;
                }
                const data = (await resp.json()) as { name: string | null; previewImageUrl?: string | null };
                if (!data.name) {
                    setFetchedResult({ state: "not-found", parsedId: id });
                } else {
                    setFetchedResult({
                        state: "new",
                        parsedId: id,
                        cg: { id, name: data.name, previewImageUrl: data.previewImageUrl ?? null },
                    });
                }
            } catch {
                setFetchedResult({ state: "not-found", parsedId: id });
            } finally {
                setIsFetching(false);
            }
        },
        [value, resolve],
    );

    // Carried-through add intent: a campground id passed in via `/app?add=<id>`
    // (e.g. the user looked it up on the homepage, then signed in). Pre-fill the
    // input and resolve it once so the result card is ready to "Add".
    const appliedInitialRef = useRef(false);
    useEffect(() => {
        if (!initialQuery || appliedInitialRef.current) return;
        appliedInitialRef.current = true;
        setValue(initialQuery);
        setTouched(true);
        void doLookup(initialQuery);
    }, [initialQuery, doLookup]);

    // Input change: reset the derived/fetched state so a fresh lookup runs.
    const handleInputChange = (v: string) => {
        setValue(v);
        setTouched(true);
        setFetchedResult(null);
        setSearchResults(null);
        setAddedSuccess(false);
    };
    const handleInputFocus = () => setTouched(true);

    const fill = (v: string) => {
        setValue(v);
        setTouched(true);
        setFetchedResult(null);
        setSearchResults(null);
        setAddedSuccess(false);
        void doLookup(v);
    };

    const pickSearchResult = (r: SearchResult) => {
        setValue(r.id);
        setTouched(true);
        setFetchedResult(null);
        setSearchResults(null);
        setAddedSuccess(false);
        void doLookup(r.id);
    };

    const handleAdd = useCallback(async () => {
        if (!displayResult?.cg) return;
        const { id, name, previewImageUrl } = displayResult.cg;
        const entry = buildNewCampground(id, name, previewImageUrl);
        const existing = userCampgrounds.siteConfig["recreation.gov"] ?? [];
        const nextConfig: SiteConfig = {
            ...userCampgrounds.siteConfig,
            "recreation.gov": [...existing, entry],
        };
        const gs: GlobalSettings = userCampgrounds.globalSettings;
        setAdding(true);
        try {
            await userCampgrounds.save(nextConfig, gs);
            setAddedSuccess(true);
            setFetchedResult(null);
        } finally {
            setAdding(false);
        }
    }, [displayResult, userCampgrounds]);

    return {
        isMobile,
        authLoading: auth.isLoading,
        value,
        touched,
        displayResult,
        isLoading,
        isFetching,
        isSearching,
        searchResults,
        signedIn,
        adding,
        addedSuccess,
        previouslyWatched,
        handleInputChange,
        handleInputFocus,
        doLookup,
        fill,
        pickSearchResult,
        handleAdd,
        handleReadd,
    };
}
