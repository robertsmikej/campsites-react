"use client";

import { useCallback, useMemo, useState } from "react";
import type { Campground, SiteConfig, GlobalSettings } from "@/types/campground";
import { useAuth } from "@/hooks/use-auth";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import type { SearchResult } from "@/app/api/campgrounds/search/route";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { C } from "@/components/field-notes/tokens";
import { LoadingGhostRow } from "@/components/field-notes/loading";

// Heuristic: does this input look like a URL attempt (vs a name search)?
function looksLikeUrlAttempt(s: string): boolean {
    return /:\/\/|recreation\.gov/i.test(s);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type LookupState = "invalid" | "loading" | "on-list" | "watched" | "new" | "not-found";

interface LookupCg {
    id: string;
    name: string;
    previewImageUrl?: string | null;
}

interface LookupResult {
    state: LookupState;
    parsedId?: string;
    cg?: LookupCg;
}

export interface CampgroundLookupProps {
    variant?: "homepage" | "dashboard";
}

// ─── Input parser ─────────────────────────────────────────────────────────────
function parseInput(s: string): string | null {
    if (!s) return null;
    const trimmed = s.trim();
    // URL: recreation.gov/camping/campgrounds/233137 etc.
    const urlMatch = trimmed.match(/recreation\.gov\/[^?#]*?\/(\d{4,7})(?:[/?#]|$)/i);
    if (urlMatch) return urlMatch[1] ?? null;
    // Bare numeric ID
    if (/^\d{4,7}$/.test(trimmed)) return trimmed;
    return null;
}

// ─── Build a default Campground entry for a new addition ──────────────────────
function buildNewCampground(id: string, name: string, previewImageUrl?: string | null): Campground {
    const now = new Date();
    const sixMonths = new Date(now);
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
        id,
        name,
        image: previewImageUrl ?? undefined,
        dates: {
            startDate: fmt(now),
            endDate: fmt(sixMonths),
        },
        sites: { favorites: [], worthwhile: [] },
        notifyAll: false,
    };
}

// ─── Icon components ──────────────────────────────────────────────────────────
function LCheck({ color = C.forest, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path
                d="M6.5 11.5 L9.5 14.5 L15.5 7.5"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function LWarn({ color = C.mustard, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path d="M11 6 L11 12 M11 15.5 L11 16" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

function LX({ color = "#A8412A", size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path
                d="M7.5 7.5 L14.5 14.5 M14.5 7.5 L7.5 14.5"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

// ─── Result card ──────────────────────────────────────────────────────────────
interface ResultCardProps {
    result: LookupResult;
    compact?: boolean;
    signedIn?: boolean;
    onAdd?: () => void;
    adding?: boolean;
    addedSuccess?: boolean;
}

function ResultCard({
    result,
    compact = false,
    signedIn = false,
    onAdd,
    adding = false,
    addedSuccess = false,
}: ResultCardProps) {
    const padding = compact ? "py-4 px-[18px]" : "py-[22px] px-[26px]";
    if (!result) return null;

    // "invalid" — not a rec.gov URL at all
    if (result.state === "invalid") {
        return (
            <div
                className={`bg-cw-cream border-[1.5px] border-cw-rule ${padding} flex gap-[14px] items-start`}
            >
                <LX />
                <div className="flex-1">
                    <div className="font-poster text-[18px] leading-[1.1] uppercase text-[#A8412A] font-black">
                        NOT A RECREATION.GOV URL
                    </div>
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft mt-[6px] italic">
                        Paste a campground URL (e.g.{" "}
                        <span className="font-mono-field not-italic text-[12px]">
                            recreation.gov/camping/campgrounds/232358
                        </span>
                        ) or just the numeric ID.
                    </div>
                </div>
            </div>
        );
    }

    // "not-found" — valid-looking ID but rec.gov returned nothing
    if (result.state === "not-found") {
        return (
            <div
                className={`bg-cw-cream border-[1.5px] border-cw-rule ${padding} flex gap-[14px] items-start`}
            >
                <LX />
                <div className="flex-1">
                    <div className="font-poster text-[18px] leading-[1.1] uppercase text-[#A8412A] font-black">
                        CAMPGROUND NOT FOUND
                    </div>
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft mt-[6px] italic">
                        ID <span className="font-mono-field not-italic text-[12px]">#{result.parsedId}</span>{" "}
                        doesn&apos;t match a campground on recreation.gov. Double-check the URL.
                    </div>
                </div>
            </div>
        );
    }

    const cg = result.cg!;
    const isOnList = result.state === "on-list" || addedSuccess;
    const isWatched = result.state === "watched";

    let statusLabel: string;
    if (isOnList) statusLabel = "Already on your watchlist";
    else if (isWatched) statusLabel = "On our watch";
    else statusLabel = "We can add this — we don't track it yet";

    let bodyText: string;
    if (isOnList) bodyText = "You're already watching this — we'll email you next time a site opens.";
    else if (isWatched)
        bodyText = "In the curator's default list. You can add it to your own watchlist in one click.";
    else bodyText = "New to our index. Polling will begin within five minutes of adding.";

    return (
        <div
            className={`bg-cw-cream border-[1.5px] border-cw-ink ${padding}`}
            style={{ boxShadow: compact ? "none" : `6px 6px 0 ${C.forest}` }}
        >
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        {isOnList ? <LCheck /> : isWatched ? <LCheck color={C.mustard} /> : <LWarn />}
                        <span className="font-mono-field text-[10px] leading-none tracking-[0.18em] text-cw-forest uppercase font-bold">
                            {statusLabel}
                        </span>
                    </div>
                    <div
                        className={`font-poster ${compact ? "text-[22px]" : "text-[28px]"} leading-none uppercase tracking-[0.005em] font-black`}
                    >
                        {cg.name}
                    </div>
                    <div
                        className={`font-italic-serif ${compact ? "text-[15px]" : "text-[18px]"} leading-[1.3] text-cw-ink-soft mt-1 font-medium italic`}
                    >
                        ID {cg.id}
                    </div>
                </div>
            </div>

            {!compact && (
                <div className="border-t border-dashed border-cw-rule mt-4 pt-[14px] flex justify-between items-center gap-4">
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft max-w-[420px] font-medium italic">
                        {bodyText}
                    </div>
                    {isOnList ? (
                        <a
                            href="/app"
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase text-cw-ink border-[1.5px] border-cw-ink py-3 px-4 no-underline rounded-[2px] whitespace-nowrap font-extrabold"
                        >
                            Manage in dashboard →
                        </a>
                    ) : signedIn ? (
                        <button
                            onClick={onAdd}
                            disabled={adding}
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase text-cw-cream py-[14px] px-[18px] border-none rounded-[2px] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap font-extrabold"
                            style={{
                                background: adding ? C.inkSoft : C.forest,
                                cursor: adding ? "not-allowed" : "pointer",
                            }}
                        >
                            {adding ? "Adding…" : "Add to my watchlist"}
                            {!adding && (
                                <svg width="12" height="12" viewBox="0 0 12 12">
                                    <path
                                        d="M1 6 L11 6 M7 2 L11 6 L7 10"
                                        stroke={C.cream}
                                        strokeWidth="1.6"
                                        fill="none"
                                    />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <a
                            href="/auth/google/start?returnTo=/"
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream py-[14px] px-[18px] no-underline rounded-[2px] inline-flex items-center gap-2 whitespace-nowrap font-extrabold"
                        >
                            Sign in to add
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path
                                    d="M1 6 L11 6 M7 2 L11 6 L7 10"
                                    stroke={C.cream}
                                    strokeWidth="1.6"
                                    fill="none"
                                />
                            </svg>
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function ResultSkeleton() {
    return (
        <div className="bg-cw-cream border-[1.5px] border-cw-rule py-[22px] px-[26px] flex flex-col gap-3">
            <LoadingGhostRow height={12} className="w-[40%]" />
            <LoadingGhostRow height={22} className="w-[70%]" />
            <LoadingGhostRow height={12} className="w-[55%]" />
        </div>
    );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export function CampgroundLookup({ variant: _variant = "homepage" }: CampgroundLookupProps) {
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

            // Check default (missingFromDefault reflects what's in default but not user)
            const inDefault = userCampgrounds.missingFromDefault.find((c) => c.id === id);
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

    const chips = [
        { label: '"Redfish Lake" (name)', val: "Redfish Lake" },
        { label: "Outlet (catalog)", val: "232358" },
        { label: "Pine Flats (catalog)", val: "232312" },
        { label: "Bad URL", val: "https://example.com/yosemite" },
    ];

    // PAD_M = 22px
    const PAD_M = 22;

    return (
        <section className="relative py-[60px] px-[22px] md:py-[88px] md:px-14 bg-cw-paper font-body-serif text-cw-ink border-t-[1.5px] border-cw-ink">
            {/* Hover style for chips — injected once, no @import */}
            <style>{`
                .cw-chip:hover { background: ${C.ink} !important; color: ${C.cream} !important; border-color: ${C.ink} !important; }
                .cw-input:focus { outline: none; border-color: ${C.forest}; box-shadow: 0 0 0 3px rgba(31,61,42,0.12); }
            `}</style>

            <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6 md:gap-14 items-start">
                {/* LEFT — copy */}
                <div>
                    <div className="font-mono-field text-[11px] leading-none tracking-[0.18em] text-cw-clay mb-[14px] font-medium uppercase">
                        LOOKUP
                    </div>
                    <h2 className="m-0 mb-[18px] tracking-[-0.005em]">
                        <span className="font-poster text-[56px] leading-[0.95] uppercase block font-black">
                            CHECK A SPOT
                        </span>
                        <span className="font-italic-serif text-[56px] leading-none block text-cw-forest mt-1 tracking-[-0.01em] font-medium italic">
                            before you add it.
                        </span>
                    </h2>
                    <p className="font-body-serif text-[17px] leading-[1.6] text-cw-ink-soft max-w-[460px] m-0 mb-[22px]">
                        Paste any campground URL or ID from <em>recreation.gov</em>. We&apos;ll tell you
                        whether it&apos;s already on our watch — and let you add it to your own list in one
                        click.
                    </p>
                    <div className="font-hand text-[22px] leading-[1.2] text-cw-clay -rotate-[2deg] inline-block font-semibold italic">
                        ↘ works from any URL on recreation.gov
                    </div>
                </div>

                {/* RIGHT — input + result */}
                <div>
                    {/* Input row */}
                    <div className="bg-cw-cream border-[1.5px] border-cw-ink block md:grid md:grid-cols-[128px_1fr_auto] items-stretch">
                        {!isMobile && (
                            <div className="bg-cw-ink text-cw-cream flex items-center justify-center font-mono-field text-[10px] leading-[1.2] tracking-[0.18em] uppercase text-center px-[10px] font-bold">
                                URL, ID, or name
                            </div>
                        )}
                        <div className={isMobile ? "flex items-stretch" : "contents"}>
                            <input
                                className="cw-input font-mono-field bg-transparent border-none border-l border-cw-rule text-cw-ink w-full min-w-0"
                                style={{
                                    fontSize: isMobile ? 13 : 16,
                                    padding: isMobile ? "14px 12px" : "20px 18px",
                                    borderLeft: `1px solid ${C.rule}`,
                                }}
                                type="text"
                                value={value}
                                placeholder={
                                    isMobile
                                        ? "recreation.gov/…/232358"
                                        : "Outlet Campground · 232358 · recreation.gov/camping/campgrounds/232358"
                                }
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    setTouched(true);
                                    setFetchedResult(null);
                                    setSearchResults(null);
                                    setAddedSuccess(false);
                                }}
                                onFocus={() => setTouched(true)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void doLookup();
                                }}
                            />
                        </div>
                        <button
                            onClick={() => void doLookup()}
                            className="font-poster text-[13px] leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream border-none cursor-pointer flex items-center justify-center gap-[10px] font-extrabold"
                            style={{
                                padding: isMobile ? "16px 0" : "0 26px",
                                borderTop: isMobile ? `1.5px solid ${C.ink}` : undefined,
                                width: isMobile ? "100%" : undefined,
                            }}
                        >
                            Check
                            <svg width="14" height="14" viewBox="0 0 14 14">
                                <path
                                    d="M1 7 L13 7 M8 2 L13 7 L8 12"
                                    stroke={C.cream}
                                    strokeWidth="1.8"
                                    fill="none"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Try chips */}
                    <div
                        className="mt-[14px] flex items-center gap-[10px]"
                        style={{
                            flexWrap: isMobile ? undefined : "wrap",
                            overflowX: isMobile ? "auto" : undefined,
                            paddingBottom: isMobile ? 4 : undefined,
                            marginLeft: isMobile ? -PAD_M : undefined,
                            paddingLeft: isMobile ? PAD_M : undefined,
                            marginRight: isMobile ? -PAD_M : undefined,
                            paddingRight: isMobile ? PAD_M : undefined,
                        }}
                    >
                        <span className="font-mono-field text-[10px] leading-none tracking-[0.16em] text-cw-ink-soft uppercase flex-shrink-0 font-medium">
                            Try →
                        </span>
                        {chips.map((ex) => (
                            <button
                                key={ex.val}
                                className="cw-chip font-mono-field text-[11px] leading-none tracking-[0.06em] bg-transparent text-cw-ink py-[7px] px-[10px] border border-dashed border-cw-rule cursor-pointer transition-[background,color,border-color] duration-[140ms] font-medium"
                                style={{
                                    flexShrink: isMobile ? 0 : undefined,
                                    whiteSpace: isMobile ? "nowrap" : undefined,
                                }}
                                onClick={() => fill(ex.val)}
                            >
                                {ex.label}
                            </button>
                        ))}
                    </div>

                    {/* Search results (name search) */}
                    {(isSearching || (searchResults && searchResults.length > 0)) && (
                        <div className="mt-[22px] bg-cw-cream border-[1.5px] border-cw-ink">
                            <div className="font-mono-field text-[10px] leading-none tracking-[0.18em] uppercase text-cw-clay py-3 px-[18px] border-b border-cw-rule font-bold">
                                {isSearching
                                    ? "Searching recreation.gov…"
                                    : `${searchResults?.length ?? 0} matches`}
                            </div>
                            {isSearching ? (
                                <div className="p-[18px]">
                                    <ResultSkeleton />
                                </div>
                            ) : (
                                <ul className="list-none m-0 p-0">
                                    {(searchResults ?? []).map((r) => (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={() => pickSearchResult(r)}
                                                className="block w-full text-left bg-transparent border-none border-t border-dashed border-cw-rule py-[14px] px-[18px] cursor-pointer font-body-serif text-[16px] leading-[1.3] text-cw-ink"
                                            >
                                                <div className="font-poster text-[18px] leading-[1.05] uppercase tracking-[0.005em] font-black">
                                                    {r.name}
                                                </div>
                                                <div className="font-italic-serif text-[14px] leading-[1.3] text-cw-ink-soft mt-[2px] font-medium italic">
                                                    {[r.area, r.state].filter(Boolean).join(" · ") ||
                                                        "Recreation.gov"}
                                                </div>
                                                <div className="font-mono-field text-[10px] leading-none text-cw-ink-soft tracking-[0.14em] mt-[6px] uppercase font-medium">
                                                    ID {r.id}
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* No-match hint when search returned empty */}
                    {!isSearching && searchResults && searchResults.length === 0 && !displayResult && (
                        <div className="mt-[22px] bg-transparent border-[1.5px] border-dashed border-cw-rule py-5 px-[22px] font-italic-serif text-[16px] leading-[1.4] text-cw-ink-soft italic">
                            No recreation.gov campgrounds match &ldquo;{value.trim()}&rdquo;. Try a shorter or
                            different name.
                        </div>
                    )}

                    {/* Result area */}
                    <div className="mt-[22px] min-h-[200px]">
                        {auth.isLoading && touched ? (
                            <ResultSkeleton />
                        ) : isLoading ? (
                            <ResultSkeleton />
                        ) : displayResult ? (
                            <ResultCard
                                result={displayResult}
                                signedIn={signedIn}
                                onAdd={() => void handleAdd()}
                                adding={adding}
                                addedSuccess={addedSuccess}
                            />
                        ) : !searchResults && !isSearching ? (
                            <div className="bg-transparent border-[1.5px] border-dashed border-cw-rule py-6 px-[26px] min-h-[160px] flex flex-col justify-center gap-2">
                                <div className="font-italic-serif text-[18px] leading-[1.3] text-cw-ink-soft font-medium italic">
                                    Waiting on a URL, ID, or name…
                                </div>
                                <div className="font-body-serif text-[14px] leading-[1.5] text-cw-ink-soft max-w-[480px]">
                                    Search by campground name (e.g.{" "}
                                    <span className="font-mono-field text-[12px]">Stanley Lake</span>), paste
                                    a recreation.gov URL, or a bare numeric ID like{" "}
                                    <span className="font-mono-field text-[12px]">232358</span>.
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ─── States reference panel — desktop only ─── */}
            {!isMobile && (
                <div className="mt-[72px] border-t-[1.5px] border-cw-ink pt-9">
                    <div className="flex items-baseline justify-between mb-6">
                        <h3 className="font-poster text-[22px] leading-none uppercase tracking-[0.005em] m-0 font-black">
                            Result states
                        </h3>
                        <span className="font-italic-serif text-[16px] leading-none text-cw-ink-soft font-medium italic">
                            One section, five possible responses.
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-[18px]">
                        {(
                            [
                                {
                                    label: "01 · On your list already",
                                    result: {
                                        state: "on-list" as LookupState,
                                        parsedId: "232358",
                                        cg: { id: "232358", name: "Outlet Campground" },
                                    },
                                },
                                {
                                    label: "02 · On our watch",
                                    result: {
                                        state: "watched" as LookupState,
                                        parsedId: "232312",
                                        cg: { id: "232312", name: "Pine Flats Campground" },
                                    },
                                },
                                {
                                    label: "03 · New — we'll start",
                                    result: {
                                        state: "new" as LookupState,
                                        parsedId: "233858",
                                        cg: { id: "233858", name: "Stanley Lake Campground" },
                                    },
                                },
                                {
                                    label: "04 · Campground not found",
                                    result: { state: "not-found" as LookupState, parsedId: "999999" },
                                },
                                {
                                    label: "05 · Invalid URL",
                                    result: { state: "invalid" as LookupState },
                                },
                            ] as { label: string; result: LookupResult }[]
                        ).map((s) => (
                            <div key={s.label}>
                                <div className="font-mono-field text-[10px] leading-none tracking-[0.18em] text-cw-clay mb-2 uppercase font-medium">
                                    {s.label}
                                </div>
                                <ResultCard result={s.result} compact />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
