"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Campground, SiteConfig, GlobalSettings } from "@/types/campground";
import { useAuth } from "@/hooks/use-auth";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import type { SearchResult } from "@/app/api/campgrounds/search/route";

function useIsMobile(breakpointPx = 768): boolean {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
        setIsMobile(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [breakpointPx]);
    return isMobile;
}

const PAD_M = 22;

// Heuristic: does this input look like a URL attempt (vs a name search)?
function looksLikeUrlAttempt(s: string): boolean {
    return /:\/\/|recreation\.gov/i.test(s);
}

// ─── Color palette (matches page.tsx) ────────────────────────────────────────
const C = {
    paper: "#F4EAD8",
    cream: "#FBF6EA",
    ink: "#1A1614",
    inkSoft: "rgba(26,22,20,0.7)",
    rule: "rgba(26,22,20,0.18)",
    forest: "#1F3D2A",
    clay: "#B65C3F",
    mustard: "#C9A227",
    red: "#A8412A",
    warn: "#C9A227",
};

// ─── Font helpers (CSS variables loaded via layout.tsx) ───────────────────────
const FH = "var(--font-poster), 'Anton', sans-serif";
const FI = "var(--font-italic-serif), 'Cormorant', Georgia, serif";
const FB = "var(--font-body-serif), 'Source Serif Pro', Georgia, serif";
const FM = "var(--font-mono-field), 'JetBrains Mono', ui-monospace, monospace";
const FN = "var(--font-hand), 'Kalam', cursive";

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
    if (urlMatch) return urlMatch[1];
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
            <path d="M6.5 11.5 L9.5 14.5 L15.5 7.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function LWarn({ color = C.warn, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path d="M11 6 L11 12 M11 15.5 L11 16" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

function LX({ color = C.red, size = 22 }: { color?: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="10" fill={color} />
            <path d="M7.5 7.5 L14.5 14.5 M14.5 7.5 L7.5 14.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
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

function ResultCard({ result, compact = false, signedIn = false, onAdd, adding = false, addedSuccess = false }: ResultCardProps) {
    const padding = compact ? "16px 18px" : "22px 26px";
    if (!result) return null;

    // "invalid" — not a rec.gov URL at all
    if (result.state === "invalid") {
        return (
            <div style={{ background: C.cream, border: `1.5px solid ${C.rule}`, padding, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <LX />
                <div style={{ flex: 1 }}>
                    <div style={{ font: `900 18px/1.1 ${FH}`, textTransform: "uppercase", color: C.red }}>NOT A RECREATION.GOV URL</div>
                    <div style={{ font: `400 italic 15px/1.4 ${FI}`, color: C.inkSoft, marginTop: 6 }}>
                        Paste a campground URL (e.g.{" "}
                        <span style={{ fontFamily: FM, fontStyle: "normal", fontSize: 12 }}>recreation.gov/camping/campgrounds/232358</span>
                        ) or just the numeric ID.
                    </div>
                </div>
            </div>
        );
    }

    // "not-found" — valid-looking ID but rec.gov returned nothing
    if (result.state === "not-found") {
        return (
            <div style={{ background: C.cream, border: `1.5px solid ${C.rule}`, padding, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <LX />
                <div style={{ flex: 1 }}>
                    <div style={{ font: `900 18px/1.1 ${FH}`, textTransform: "uppercase", color: C.red }}>CAMPGROUND NOT FOUND</div>
                    <div style={{ font: `400 italic 15px/1.4 ${FI}`, color: C.inkSoft, marginTop: 6 }}>
                        ID{" "}
                        <span style={{ fontFamily: FM, fontStyle: "normal", fontSize: 12 }}>#{result.parsedId}</span>{" "}
                        doesn&apos;t match a campground on recreation.gov. Double-check the URL.
                    </div>
                </div>
            </div>
        );
    }

    const cg = result.cg!;
    const isOnList = result.state === "on-list" || addedSuccess;
    const isNew = result.state === "new";
    const isWatched = result.state === "watched";

    let statusLabel: string;
    if (isOnList) statusLabel = "Already on your watchlist";
    else if (isWatched) statusLabel = "On our watch";
    else statusLabel = "We can add this — we don't track it yet";

    let bodyText: string;
    if (isOnList) bodyText = "You're already watching this — we'll email you next time a site opens.";
    else if (isWatched) bodyText = "In the curator's default list. You can add it to your own watchlist in one click.";
    else bodyText = "New to our index. Polling will begin within five minutes of adding.";

    return (
        <div style={{
            background: C.cream, border: `1.5px solid ${C.ink}`,
            boxShadow: compact ? "none" : `6px 6px 0 ${C.forest}`,
            padding,
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        {isOnList ? <LCheck /> : (isWatched ? <LCheck color={C.mustard} /> : <LWarn />)}
                        <span style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: C.forest, textTransform: "uppercase" }}>
                            {statusLabel}
                        </span>
                    </div>
                    <div style={{ font: `900 ${compact ? 22 : 28}px/1 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em" }}>
                        {cg.name}
                    </div>
                    <div style={{ font: `500 italic ${compact ? 15 : 18}px/1.3 ${FI}`, color: C.inkSoft, marginTop: 4 }}>
                        ID {cg.id}
                    </div>
                </div>
            </div>

            {!compact && (
                <div style={{ borderTop: `1px dashed ${C.rule}`, marginTop: 16, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                    <div style={{ font: `500 italic 15px/1.4 ${FI}`, color: C.inkSoft, maxWidth: 420 }}>
                        {isOnList ? bodyText : (isWatched ? bodyText : bodyText)}
                    </div>
                    {isOnList ? (
                        <a
                            href="/app"
                            style={{
                                font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase",
                                color: C.ink, border: `1.5px solid ${C.ink}`, padding: "12px 16px",
                                textDecoration: "none", borderRadius: 2, whiteSpace: "nowrap",
                            }}
                        >
                            Manage in dashboard →
                        </a>
                    ) : signedIn ? (
                        <button
                            onClick={onAdd}
                            disabled={adding}
                            style={{
                                font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase",
                                background: adding ? C.inkSoft : C.forest, color: C.cream,
                                padding: "14px 18px", border: "none", borderRadius: 2,
                                cursor: adding ? "not-allowed" : "pointer",
                                display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                            }}
                        >
                            {adding ? "Adding…" : "Add to my watchlist"}
                            {!adding && (
                                <svg width="12" height="12" viewBox="0 0 12 12">
                                    <path d="M1 6 L11 6 M7 2 L11 6 L7 10" stroke={C.cream} strokeWidth="1.6" fill="none" />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <a
                            href="/auth/google/start?returnTo=/"
                            style={{
                                font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase",
                                background: C.forest, color: C.cream, padding: "14px 18px",
                                textDecoration: "none", borderRadius: 2,
                                display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                            }}
                        >
                            Sign in to add
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path d="M1 6 L11 6 M7 2 L11 6 L7 10" stroke={C.cream} strokeWidth="1.6" fill="none" />
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
        <div style={{
            background: C.cream, border: `1.5px solid ${C.rule}`,
            padding: "22px 26px", display: "flex", flexDirection: "column", gap: 12,
        }}>
            <div style={{ height: 12, width: "40%", background: "rgba(26,22,20,0.08)", borderRadius: 2 }} />
            <div style={{ height: 22, width: "70%", background: "rgba(26,22,20,0.12)", borderRadius: 2 }} />
            <div style={{ height: 12, width: "55%", background: "rgba(26,22,20,0.06)", borderRadius: 2 }} />
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
            // We also need what IS in default — use missingFromDefault inverse detection:
            // We don't have direct access to defaultRecord, but we can check if
            // it showed up in missingFromDefault (present in default, absent from user).
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
    const isLoading = isFetching || (touched && value.trim() && memoryResult === null && !fetchedResult && auth.isLoading);

    const doLookup = useCallback(async (raw?: string) => {
        const input = (raw ?? value).trim();
        if (!input) return;
        const id = parseInput(input);
        if (!id) {
            // Not a URL/ID. If it LOOKS like a URL attempt, bail with invalid.
            // Otherwise treat as a name search.
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
        // First try memory
        setSearchResults(null);
        const mem = resolve(id);
        if (mem) {
            setFetchedResult(null); // let memoryResult drive
            return;
        }
        // Network: fetch details
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
    }, [value, resolve]);

    const fill = (v: string) => {
        setValue(v);
        setTouched(true);
        setFetchedResult(null);
        setSearchResults(null);
        setAddedSuccess(false);
        // Also run the lookup immediately so chip clicks give instant feedback
        // even when the ID isn't in the user's in-memory lists.
        void doLookup(v);
    };

    // Picking a name-search candidate behaves like pasting that ID and looking it up.
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
        // Preserve globalSettings
        const gs: GlobalSettings = userCampgrounds.globalSettings;
        setAdding(true);
        try {
            await userCampgrounds.save(nextConfig, gs);
            setAddedSuccess(true);
            setFetchedResult(null); // let memory resolve pick it up as "on-list"
        } finally {
            setAdding(false);
        }
    }, [displayResult, userCampgrounds]);

    // Try-chips: name search + a couple of real IDs + a bad URL
    const chips = [
        { label: "\"Redfish Lake\" (name)", val: "Redfish Lake" },
        { label: "Outlet (catalog)", val: "232358" },
        { label: "Pine Flats (catalog)", val: "232312" },
        { label: "Bad URL", val: "https://example.com/yosemite" },
    ];

    return (
        <section
            style={{
                padding: isMobile ? `60px ${PAD_M}px 50px` : "88px 56px",
                background: C.paper,
                position: "relative",
                fontFamily: FB,
                color: C.ink,
                borderTop: `1.5px solid ${C.ink}`,
            }}
        >
            {/* Hover style for chips — injected once, no @import */}
            <style>{`
                .cw-chip:hover { background: ${C.ink} !important; color: ${C.cream} !important; border-color: ${C.ink} !important; }
                .cw-input:focus { outline: none; border-color: ${C.forest}; box-shadow: 0 0 0 3px rgba(31,61,42,0.12); }
            `}</style>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 1fr", gap: isMobile ? 24 : 56, alignItems: "flex-start" }}>
                {/* LEFT — copy */}
                <div>
                    <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: C.clay, marginBottom: 14 }}>
                        LOOKUP
                    </div>
                    <h2 style={{ margin: "0 0 18px", letterSpacing: "-0.005em" }}>
                        <span style={{ font: `900 56px/0.95 ${FH}`, textTransform: "uppercase", display: "block" }}>
                            CHECK A SPOT
                        </span>
                        <span style={{ font: `500 italic 56px/1 ${FI}`, display: "block", color: C.forest, marginTop: 4, letterSpacing: "-0.01em" }}>
                            before you add it.
                        </span>
                    </h2>
                    <p style={{ font: `400 17px/1.6 ${FB}`, color: C.inkSoft, maxWidth: 460, margin: "0 0 22px" }}>
                        Paste any campground URL or ID from <em>recreation.gov</em>. We&apos;ll tell you whether it&apos;s already on our watch — and let you add it to your own list in one click.
                    </p>
                    <div style={{ font: `600 italic 22px/1.2 ${FN}`, color: C.clay, transform: "rotate(-2deg)", display: "inline-block" }}>
                        ↘ works from any URL on recreation.gov
                    </div>
                </div>

                {/* RIGHT — input + result */}
                <div>
                    {/* Input row */}
                    <div style={{
                        background: C.cream, border: `1.5px solid ${C.ink}`,
                        display: isMobile ? "block" : "grid",
                        gridTemplateColumns: isMobile ? undefined : "128px 1fr auto",
                        alignItems: "stretch",
                    }}>
                        {!isMobile && (
                            <div style={{
                                background: C.ink, color: C.cream,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                font: `700 10px/1.2 ${FM}`, letterSpacing: "0.18em", textTransform: "uppercase",
                                textAlign: "center", padding: "0 10px",
                            }}>
                                URL, ID, or name
                            </div>
                        )}
                        <div style={isMobile ? { display: "flex", alignItems: "stretch" } : { display: "contents" }}>
                            <input
                                className="cw-input"
                                type="text"
                                value={value}
                                placeholder={isMobile ? "recreation.gov/…/232358" : "Outlet Campground · 232358 · recreation.gov/camping/campgrounds/232358"}
                                onChange={(e) => { setValue(e.target.value); setTouched(true); setFetchedResult(null); setSearchResults(null); setAddedSuccess(false); }}
                                onFocus={() => setTouched(true)}
                                onKeyDown={(e) => { if (e.key === "Enter") void doLookup(); }}
                                style={{
                                    font: `500 ${isMobile ? 13 : 16}px/1 ${FM}`,
                                    padding: isMobile ? "14px 12px" : "20px 18px",
                                    background: "transparent",
                                    border: "none", borderLeft: `1px solid ${C.rule}`,
                                    color: C.ink, width: "100%",
                                    minWidth: 0,
                                }}
                            />
                        </div>
                        <button
                            onClick={() => void doLookup()}
                            style={{
                                font: `800 13px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase",
                                background: C.forest, color: C.cream,
                                padding: isMobile ? "16px 0" : "0 26px",
                                border: "none",
                                borderTop: isMobile ? `1.5px solid ${C.ink}` : undefined,
                                cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                width: isMobile ? "100%" : undefined,
                            }}
                        >
                            Check
                            <svg width="14" height="14" viewBox="0 0 14 14">
                                <path d="M1 7 L13 7 M8 2 L13 7 L8 12" stroke={C.cream} strokeWidth="1.8" fill="none" />
                            </svg>
                        </button>
                    </div>

                    {/* Try chips */}
                    <div style={{
                        marginTop: 14,
                        display: "flex", alignItems: "center", gap: 10,
                        flexWrap: isMobile ? undefined : "wrap",
                        overflowX: isMobile ? "auto" : undefined,
                        paddingBottom: isMobile ? 4 : undefined,
                        marginLeft: isMobile ? -PAD_M : undefined,
                        paddingLeft: isMobile ? PAD_M : undefined,
                        marginRight: isMobile ? -PAD_M : undefined,
                        paddingRight: isMobile ? PAD_M : undefined,
                    }}>
                        <span style={{ font: `500 10px/1 ${FM}`, letterSpacing: "0.16em", color: C.inkSoft, textTransform: "uppercase", flexShrink: 0 }}>
                            Try →
                        </span>
                        {chips.map((ex) => (
                            <button
                                key={ex.val}
                                className="cw-chip"
                                onClick={() => fill(ex.val)}
                                style={{
                                    font: `500 11px/1 ${FM}`, letterSpacing: "0.06em",
                                    background: "transparent", color: C.ink, padding: "7px 10px",
                                    border: `1px dashed ${C.rule}`, cursor: "pointer",
                                    transition: "background .14s, color .14s, border-color .14s",
                                    flexShrink: isMobile ? 0 : undefined,
                                    whiteSpace: isMobile ? "nowrap" : undefined,
                                }}
                            >
                                {ex.label}
                            </button>
                        ))}
                    </div>

                    {/* Search results (name search) */}
                    {(isSearching || (searchResults && searchResults.length > 0)) && (
                        <div style={{ marginTop: 22, background: C.cream, border: `1.5px solid ${C.ink}` }}>
                            <div style={{
                                font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", textTransform: "uppercase",
                                color: C.clay, padding: "12px 18px", borderBottom: `1px solid ${C.rule}`,
                            }}>
                                {isSearching ? "Searching recreation.gov…" : `${searchResults?.length ?? 0} matches`}
                            </div>
                            {isSearching ? (
                                <div style={{ padding: 18 }}>
                                    <ResultSkeleton />
                                </div>
                            ) : (
                                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                    {(searchResults ?? []).map((r) => (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={() => pickSearchResult(r)}
                                                style={{
                                                    display: "block", width: "100%", textAlign: "left",
                                                    background: "transparent", border: "none",
                                                    borderTop: `1px dashed ${C.rule}`,
                                                    padding: "14px 18px", cursor: "pointer",
                                                    font: `400 16px/1.3 ${FB}`, color: C.ink,
                                                }}
                                            >
                                                <div style={{ font: `900 18px/1.05 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em" }}>
                                                    {r.name}
                                                </div>
                                                <div style={{ font: `500 italic 14px/1.3 ${FI}`, color: C.inkSoft, marginTop: 2 }}>
                                                    {[r.area, r.state].filter(Boolean).join(" · ") || "Recreation.gov"}
                                                </div>
                                                <div style={{ font: `500 10px/1 ${FM}`, color: C.inkSoft, letterSpacing: "0.14em", marginTop: 6, textTransform: "uppercase" }}>
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
                        <div style={{
                            marginTop: 22, background: "transparent",
                            border: `1.5px dashed ${C.rule}`, padding: "20px 22px",
                            font: `500 italic 16px/1.4 ${FI}`, color: C.inkSoft,
                        }}>
                            No recreation.gov campgrounds match &ldquo;{value.trim()}&rdquo;. Try a shorter or different name.
                        </div>
                    )}

                    {/* Result area */}
                    <div style={{ marginTop: 22, minHeight: 200 }}>
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
                            <div style={{
                                background: "transparent", border: `1.5px dashed ${C.rule}`,
                                padding: "24px 26px", minHeight: 160,
                                display: "flex", flexDirection: "column", justifyContent: "center", gap: 8,
                            }}>
                                <div style={{ font: `500 italic 18px/1.3 ${FI}`, color: C.inkSoft }}>
                                    Waiting on a URL, ID, or name…
                                </div>
                                <div style={{ font: `400 14px/1.5 ${FB}`, color: C.inkSoft, maxWidth: 480 }}>
                                    Search by campground name (e.g. <span style={{ fontFamily: FM, fontSize: 12 }}>Stanley Lake</span>),
                                    paste a recreation.gov URL, or a bare numeric ID like <span style={{ fontFamily: FM, fontSize: 12 }}>232358</span>.
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ─── States reference panel — desktop only ─── */}
            {!isMobile && <div style={{ marginTop: 72, borderTop: `1.5px solid ${C.ink}`, paddingTop: 36 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
                    <h3 style={{ font: `900 22px/1 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em", margin: 0 }}>
                        Result states
                    </h3>
                    <span style={{ font: `500 italic 16px/1 ${FI}`, color: C.inkSoft }}>
                        One section, five possible responses.
                    </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                    {(
                        [
                            {
                                label: "01 · On your list already",
                                result: { state: "on-list" as LookupState, parsedId: "232358", cg: { id: "232358", name: "Outlet Campground" } },
                            },
                            {
                                label: "02 · On our watch",
                                result: { state: "watched" as LookupState, parsedId: "232312", cg: { id: "232312", name: "Pine Flats Campground" } },
                            },
                            {
                                label: "03 · New — we'll start",
                                result: { state: "new" as LookupState, parsedId: "233858", cg: { id: "233858", name: "Stanley Lake Campground" } },
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
                            <div style={{ font: `500 10px/1 ${FM}`, letterSpacing: "0.18em", color: C.clay, marginBottom: 8, textTransform: "uppercase" }}>
                                {s.label}
                            </div>
                            <ResultCard result={s.result} compact />
                        </div>
                    ))}
                </div>
            </div>}
        </section>
    );
}
