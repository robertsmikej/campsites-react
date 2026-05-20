"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { ProgressBarEl } from "@/components/progress-bar-el";
import { SiteConfigDialog } from "@/components/site-config-dialog";
import SiteSettingsContext from "@/context/site-settings";
import ProgressBarContext from "@/context/progress-bar";
import { Button } from "@/components/ui/button";
import { siteData } from "@/data/site-data";
import { useUserCampgrounds } from "@/hooks/use-user-campgrounds";
import { useCampgroundsData } from "@/hooks/use-campgrounds-data";
import { useAuth } from "@/hooks/use-auth";
import { clearCampgroundCache } from "@/lib/recreation-gov";
import { CampgroundLookup } from "@/components/campground-lookup";
import { CampgroundRow } from "@/components/campground-row";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";
import type { SiteSettingsValue } from "@/context/site-settings";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

// ─── Font helpers (CSS variables from layout.tsx) ────────────────────────────
const FH = "var(--font-poster), 'Big Shoulders Display', 'Anton', sans-serif";
const FI = "var(--font-italic-serif), 'Cormorant Garamond', Georgia, serif";
const FB = "var(--font-body-serif), 'Source Serif 4', Georgia, serif";
const FM = "var(--font-mono-field), 'DM Mono', 'JetBrains Mono', ui-monospace, monospace";

// ─── Inline colour tokens — always read CSS vars so dark-mode flips work ──────
//     We reference var(--cw-*) directly in inline styles; these string constants
//     are convenience aliases so the JSX stays readable.
const CW = {
    paper:     "var(--cw-paper)",
    cream:     "var(--cw-cream)",
    ink:       "var(--cw-ink)",
    inkSoft:   "var(--cw-ink-soft)",
    inkSubtle: "var(--cw-ink-subtle)",
    inkFaint:  "var(--cw-ink-faint)",
    rule:      "var(--cw-rule)",
    ruleSoft:  "var(--cw-rule-soft)",
    forest:    "var(--cw-forest)",
    clay:      "var(--cw-clay)",
    mustard:   "var(--cw-mustard)",
} as const;

// ─── useIsMobile (copied from homepage pattern) ───────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readStorage<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch { return fallback; }
}

function writeStorage(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function toLocalIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatShortRange(start: Date, end: Date): string {
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function getTimeOfDay(): "morning" | "afternoon" | "evening" {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    return "evening";
}

function romanYear(y: number): string {
    // Minimal roman numeral for display purposes
    const map: [number, string][] = [
        [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
        [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
    ];
    let r = "";
    let n = y;
    for (const [v, s] of map) { while (n >= v) { r += s; n -= v; } }
    return r;
}

function formatDateEyebrow(): string {
    const now = new Date();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()} · ${romanYear(now.getFullYear())}`;
}

// ─── Pulse dot ───────────────────────────────────────────────────────────────
function Pulse({ color, size = 7 }: { color: string; size?: number }) {
    return (
        <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
            <span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1px solid ${color}`, opacity: 0.4, animation: "cw-pulse 1.8s ease-out infinite" }} />
        </span>
    );
}

// ─── Availability bars (inline, from the design) ──────────────────────────────
function AvailBars({ campground, windowStart, windowEnd, height = 22, bar = 5 }: {
    campground: ProcessedCampground;
    windowStart: Date;
    windowEnd: Date;
    height?: number;
    bar?: number;
}) {
    // Build a day-by-day pattern string: 'g' = open (favorite/unrated), 'y' = worthwhile, '.' = booked
    const days: string[] = [];
    const cursor = new Date(windowStart);
    cursor.setHours(0, 0, 0, 0);
    const winEndIso = toLocalIso(windowEnd);

    while (toLocalIso(cursor) <= winEndIso) {
        const iso = toLocalIso(cursor);
        // check any site has a match covering this date
        let hasMatch = false;
        for (const site of Object.values(campground.siteAvailability ?? {})) {
            for (const m of site.matches ?? []) {
                if (m.from <= iso && m.to > iso) { hasMatch = true; break; }
            }
            if (hasMatch) break;
        }
        days.push(hasMatch ? "g" : ".");
        cursor.setDate(cursor.getDate() + 1);
    }

    // Cap to ~42 bars for display
    const sample = days.length > 42 ? days.filter((_, i) => i % Math.ceil(days.length / 42) === 0).slice(0, 42) : days;

    return (
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: height + 2, flexShrink: 0 }}>
            {sample.map((c, i) => {
                const h = c === "." ? Math.round(height * 0.22) : height;
                const bg = c === "." ? CW.inkFaint : CW.forest;
                return <div key={i} style={{ width: bar, height: h, background: bg, borderRadius: 1 }} />;
            })}
        </div>
    );
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ openCount }: { openCount: number }) {
    const isOpen = openCount > 0;
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isOpen
                ? <span style={{ width: 7, height: 7, borderRadius: 4, background: CW.forest }} />
                : <span style={{ width: 7, height: 7, borderRadius: 4, border: `1.5px solid ${CW.clay}` }} />}
            <span style={{ font: `700 11px/1 ${FM}`, letterSpacing: "0.12em", color: isOpen ? CW.forest : CW.clay, textTransform: "uppercase" }}>
                {isOpen ? "Open" : "Quiet"}
            </span>
        </span>
    );
}

// ─── Opening card ─────────────────────────────────────────────────────────────
interface OpeningItem {
    id: string;
    campgroundName: string;
    siteId: string;
    siteName?: string;
    from: string; // YYYY-MM-DD
    to: string;   // YYYY-MM-DD (exclusive)
    nights: number;
    recGovId?: string;
    isSnoozed: boolean;
}

function formatOpeningDates(from: string, to: string): string {
    const f = new Date(from + "T00:00:00");
    const tDate = new Date(to + "T00:00:00");
    const last = new Date(tDate);
    last.setDate(tDate.getDate() - 1);
    const dow = new Intl.DateTimeFormat("en-US", { weekday: "short" });
    const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    if (f.toDateString() === last.toDateString()) {
        return `${dow.format(f)}, ${date.format(f)}`;
    }
    return `${dow.format(f)} – ${dow.format(last)}, ${date.format(f)} – ${date.format(last)}`;
}

function snoozeUntilDate(): string {
    // 1 month from today
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return toLocalIso(d);
}

function formatSnoozeLabel(until: string): string {
    const d = new Date(until + "T00:00:00");
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
    return `Until ${fmt.format(d)}`;
}

function OpeningCard({ item, isMobile, onSnooze }: {
    item: OpeningItem;
    isMobile: boolean;
    onSnooze: (id: string) => void;
}) {
    const recGovUrl = item.recGovId
        ? `https://www.recreation.gov/camping/campgrounds/${item.recGovId}`
        : "https://www.recreation.gov";

    const snoozedUntil = readStorage<Record<string, string>>("campwatch:snoozed-openings", {});
    const isSnoozedNow = item.id in snoozedUntil;

    return (
        <article style={{
            background: CW.cream,
            border: `1.5px solid ${CW.ink}`,
            boxShadow: isMobile ? `4px 4px 0 ${CW.forest}` : `6px 6px 0 ${CW.forest}`,
            padding: isMobile ? "16px 18px" : "20px 22px 18px",
            display: "flex", flexDirection: "column", gap: isMobile ? 12 : 14,
            minWidth: isMobile ? 270 : undefined,
            scrollSnapAlign: isMobile ? "start" : undefined,
            flexShrink: isMobile ? 0 : undefined,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Pulse color={CW.forest} size={6} />
                <span style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.forest, textTransform: "uppercase" }}>
                    NEW
                </span>
            </div>
            <div>
                <div style={{ font: `900 ${isMobile ? 17 : 20}px/1.1 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em" }}>
                    {item.campgroundName}
                </div>
                {item.siteName && (
                    <div style={{ font: `500 italic ${isMobile ? 13 : 15}px/1.3 ${FI}`, color: CW.inkSoft, marginTop: 4 }}>
                        Site {item.siteName}
                    </div>
                )}
            </div>
            <div style={{ borderTop: `1px dashed ${CW.rule}`, paddingTop: isMobile ? 10 : 12 }}>
                <div style={{ font: `600 ${isMobile ? 14 : 16}px/1.2 ${FB}`, color: CW.ink }}>
                    {formatOpeningDates(item.from, item.to)}
                </div>
                <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.12em", color: CW.inkSoft, marginTop: 4, textTransform: "uppercase" }}>
                    {item.nights} night{item.nights !== 1 ? "s" : ""}
                </div>
            </div>
            <a
                href={recGovUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    font: `800 ${isMobile ? 11 : 12}px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase",
                    background: CW.forest, color: CW.cream,
                    padding: isMobile ? "12px" : "13px 14px",
                    textDecoration: "none", textAlign: "center", borderRadius: 2,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
            >
                Book on rec.gov ↗
            </a>
            <button
                onClick={() => onSnooze(item.id)}
                style={{
                    font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                    background: isSnoozedNow ? CW.mustard : "transparent",
                    color: isSnoozedNow ? CW.ink : CW.inkSubtle,
                    border: `1px solid ${isSnoozedNow ? "transparent" : CW.rule}`,
                    padding: "7px 9px", cursor: "pointer", borderRadius: 2,
                    display: "inline-flex", alignItems: "center", gap: 5,
                }}
            >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" />
                </svg>
                {isSnoozedNow
                    ? formatSnoozeLabel(snoozedUntil[item.id])
                    : "Snooze 1 month"}
            </button>
        </article>
    );
}

// ─── Watchlist row (V1.2 style) ───────────────────────────────────────────────
interface WatchlistRowProps {
    campground: ProcessedCampground;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    openCount: number;
    windowStart: Date;
    windowEnd: Date;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    snoozedCgs: Set<string>;
    onSnoozeCg: (id: string) => void;
    onRatingChange?: (campgroundId: string, siteName: string, rating: "favorite" | "worthwhile" | "unrated") => void;
    onEditSettings?: (campgroundId: string) => void;
}

function WatchlistRow({
    campground,
    isFavorite,
    onToggleFavorite,
    openCount,
    windowStart,
    windowEnd,
    settings,
    globalSettings,
    isMobile,
    snoozedCgs,
    onSnoozeCg,
    onRatingChange,
    onEditSettings,
}: WatchlistRowProps) {
    const isSnoozed = !!campground.id && snoozedCgs.has(campground.id);

    if (isMobile) {
        return (
            <CampgroundRow
                campground={campground}
                showExcluded={false}
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
                settings={settings}
                globalSettings={globalSettings}
                imageUrl="/images/sites/bg_default.jpg"
                onRatingChange={onRatingChange && campground.id
                    ? (siteName, newRating) => onRatingChange(campground.id!, siteName, newRating)
                    : undefined}
                onEditSettings={onEditSettings && campground.id
                    ? () => onEditSettings(campground.id!)
                    : undefined}
                windowStart={windowStart}
                windowEnd={windowEnd}
            />
        );
    }

    // Desktop grid row with Field Notes style
    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 140px",
            gap: 24, padding: "16px 22px", alignItems: "center",
            background: openCount > 0 ? `rgba(31,61,42,0.04)` : "transparent",
            borderBottom: `1px solid ${CW.ruleSoft}`,
        }}>
            {/* Name + area */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <button
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: isFavorite ? CW.mustard : CW.inkFaint, flexShrink: 0 }}
                    onClick={onToggleFavorite}
                    aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 2 L12.5 7.5 L18.5 8.2 L14 12.4 L15.3 18.3 L10 15.5 L4.7 18.3 L6 12.4 L1.5 8.2 L7.5 7.5 Z" />
                    </svg>
                </button>
                <div style={{ minWidth: 0 }}>
                    <div style={{ font: `900 16px/1.1 ${FH}`, textTransform: "uppercase", letterSpacing: "0.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {campground.name}
                    </div>
                    <div style={{ font: `500 italic 13px/1.3 ${FI}`, color: CW.inkSoft, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {campground.area ?? ""}
                    </div>
                </div>
            </div>

            {/* Status */}
            <StatusPill openCount={openCount} />

            {/* Availability bars */}
            <AvailBars campground={campground} windowStart={windowStart} windowEnd={windowEnd} height={22} bar={5} />

            {/* Open count */}
            <div style={{ textAlign: "right", font: `900 22px/1 ${FH}`, color: openCount === 0 ? CW.inkFaint : CW.forest, fontVariantNumeric: "tabular-nums" }}>
                {openCount}
            </div>

            {/* Snooze */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {isSnoozed ? (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase", background: CW.mustard, color: CW.ink, border: "none", padding: "7px 9px", cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" /></svg>
                        Until {formatSnoozeLabel(readStorage<Record<string, string>>("campwatch:snoozed-cgs", {})[campground.id ?? ""] ?? snoozeUntilDate())}
                    </button>
                ) : (
                    <button
                        onClick={() => campground.id && onSnoozeCg(campground.id)}
                        style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase", background: "transparent", color: CW.inkSubtle, border: `1px solid ${CW.rule}`, padding: "7px 9px", cursor: "pointer", borderRadius: 2, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                        Snooze
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 4 L5 7 L8 4" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Group header ─────────────────────────────────────────────────────────────
function GroupHeader({ index, label, count, openInGroup }: { index: number; label: string; count: number; openInGroup: number }) {
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <span style={{ font: `700 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, textTransform: "uppercase" }}>
                {String(index + 1).padStart(2, "0")}
            </span>
            <span style={{ font: `500 italic 22px/1 ${FI}`, color: CW.ink, letterSpacing: "-0.005em" }}>
                {label}
            </span>
            <span style={{ font: `500 11px/1 ${FM}`, color: CW.inkSubtle, letterSpacing: "0.08em" }}>
                · {count} campground{count !== 1 ? "s" : ""}
            </span>
            {openInGroup > 0 && (
                <span style={{ font: `700 11px/1 ${FM}`, color: CW.forest, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    · {openInGroup} open
                </span>
            )}
            <div style={{ flex: 1, height: 1, background: CW.rule }} />
        </div>
    );
}

// ─── Table (grouped) ──────────────────────────────────────────────────────────
function WatchlistTable({ rows, showHeader, favorites, onToggleFavorite, openCounts, windowStart, windowEnd, settings, globalSettings, isMobile, snoozedCgs, onSnoozeCg, onRatingChange, onEditSettings }: {
    rows: ProcessedCampground[];
    showHeader: boolean;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    openCounts: Map<string, number>;
    windowStart: Date;
    windowEnd: Date;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    snoozedCgs: Set<string>;
    onSnoozeCg: (id: string) => void;
    onRatingChange?: (campgroundId: string, siteName: string, rating: "favorite" | "worthwhile" | "unrated") => void;
    onEditSettings?: (campgroundId: string) => void;
}) {
    return (
        <div style={{ background: CW.cream, border: `1px solid ${CW.ink}` }}>
            {showHeader && !isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px minmax(0,1fr) 70px 140px", gap: 24, padding: "11px 22px", borderBottom: `1px solid ${CW.rule}`, font: `500 10px/1 ${FM}`, letterSpacing: "0.16em", color: CW.inkSubtle, textTransform: "uppercase", alignItems: "center" }}>
                    <span>Campground</span><span>Status</span><span>Dates</span><span style={{ textAlign: "right" }}>Open</span><span />
                </div>
            )}
            {rows.map((c) => (
                <WatchlistRow
                    key={c.id ?? c.name}
                    campground={c}
                    isFavorite={!!c.id && favorites.has(c.id)}
                    onToggleFavorite={() => c.id && onToggleFavorite(c.id)}
                    openCount={openCounts.get(c.id ?? c.name) ?? 0}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    settings={settings}
                    globalSettings={globalSettings}
                    isMobile={isMobile}
                    snoozedCgs={snoozedCgs}
                    onSnoozeCg={onSnoozeCg}
                    onRatingChange={onRatingChange}
                    onEditSettings={onEditSettings}
                />
            ))}
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onClone, isMobile }: {
    onClone: () => Promise<void>;
    isMobile: boolean;
}) {
    const [showLookup, setShowLookup] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleClone = async () => {
        setBusy(true);
        try { await onClone(); } finally { setBusy(false); }
    };

    const pad = isMobile ? 22 : 36;

    return (
        <>
            <section style={{ padding: `64px ${pad}px`, maxWidth: 960 }}>
                <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 14, textTransform: "uppercase" }}>
                    Welcome aboard.
                </div>
                <h1 style={{ margin: "0 0 18px", letterSpacing: "-0.005em" }}>
                    <span style={{ font: `900 ${isMobile ? 38 : 56}px/0.95 ${FH}`, textTransform: "uppercase", display: "block" }}>
                        YOUR WATCHLIST
                    </span>
                    <span style={{ font: `500 italic ${isMobile ? 38 : 56}px/0.95 ${FI}`, color: CW.forest, display: "block", marginTop: 4, letterSpacing: "-0.01em" }}>
                        is empty — for now.
                    </span>
                </h1>
                <p style={{ font: `400 18px/1.55 ${FB}`, color: CW.inkSoft, margin: "0 0 40px", maxWidth: 640 }}>
                    Add a campground from <em>recreation.gov</em> and we&apos;ll start polling every five minutes. When a site you&apos;d actually take opens up, an email finds you. That&apos;s the whole thing.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, marginBottom: 32 }}>
                    {/* Path A — Paste a URL */}
                    <article style={{ background: CW.cream, border: `1.5px solid ${CW.ink}`, boxShadow: `6px 6px 0 ${CW.forest}`, padding: "24px 26px" }}>
                        <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                            Option 01
                        </div>
                        <h2 style={{ margin: "0 0 14px" }}>
                            <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>PASTE A URL</span>
                            <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from recreation.gov.</span>
                        </h2>
                        <button
                            onClick={() => setShowLookup(true)}
                            style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: CW.forest, color: CW.cream, border: "none", padding: "13px 16px", cursor: "pointer", borderRadius: 2 }}
                        >
                            Look up a campground →
                        </button>
                    </article>

                    {/* Path B — Borrow a list */}
                    <article style={{ background: CW.cream, border: `1px solid ${CW.rule}`, padding: "24px 26px" }}>
                        <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                            Option 02
                        </div>
                        <h2 style={{ margin: "0 0 14px" }}>
                            <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>BORROW A LIST</span>
                            <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from the curator.</span>
                        </h2>
                        <p style={{ font: `400 14px/1.5 ${FB}`, color: CW.inkSoft, margin: "0 0 14px" }}>
                            Start with <strong style={{ color: CW.ink }}>hand-picked campgrounds</strong> across Sawtooth, Glacier, Yosemite, and Olympic. Edit or remove any of them later.
                        </p>
                        <button
                            onClick={() => void handleClone()}
                            disabled={busy}
                            style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: "transparent", color: CW.ink, border: `1.5px solid ${CW.ink}`, padding: "12px 16px", cursor: busy ? "not-allowed" : "pointer", borderRadius: 2, opacity: busy ? 0.6 : 1 }}
                        >
                            {busy ? "Loading…" : "Use the curator's picks"}
                        </button>
                    </article>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, font: `500 italic 15px/1.4 ${FI}`, color: CW.inkSubtle }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: CW.mustard, flexShrink: 0 }} />
                    Polling won&apos;t start until you add at least one campground. We&apos;ll never email an empty watchlist.
                </div>
            </section>

            {/* Lookup modal */}
            <Dialog open={showLookup} onOpenChange={setShowLookup}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle className="font-display">Add a campground</DialogTitle>
                    </DialogHeader>
                    <div className="px-2 pb-4">
                        <CampgroundLookup variant="dashboard" />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── Add modal (TopBar button) ────────────────────────────────────────────────
function AddCampgroundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="font-display">Add a campground</DialogTitle>
                </DialogHeader>
                <div className="px-2 pb-4">
                    <CampgroundLookup variant="dashboard" />
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Date range picker ────────────────────────────────────────────────────────
const DEFAULT_RANGE_DAYS = 42;

function getDefaultRange(): { start: Date; end: Date } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + DEFAULT_RANGE_DAYS - 1);
    return { start, end };
}

function loadDateRange(): { start: Date; end: Date } {
    try {
        const raw = localStorage.getItem("campwatch:date-range");
        if (!raw) return getDefaultRange();
        const parsed = JSON.parse(raw) as { start: string; end: string };
        return { start: new Date(parsed.start), end: new Date(parsed.end) };
    } catch { return getDefaultRange(); }
}

function saveDateRange(start: Date, end: Date) {
    try {
        localStorage.setItem("campwatch:date-range", JSON.stringify({ start: toLocalIso(start), end: toLocalIso(end) }));
    } catch { /* ignore */ }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AppPage() {
    const auth = useAuth();
    const userCampgrounds = useUserCampgrounds();
    const {
        siteConfig,
        globalSettings,
        isHydrating,
        syncStatus,
        clearSyncStatus,
        save,
        cloneDefault,
    } = userCampgrounds;

    const isMobile = useIsMobile();
    const [useMockData] = useState(false);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [focusedCampgroundId, setFocusedCampgroundId] = useState<string | null>(null);
    const [dismissedSync, setDismissedSync] = useState(false);
    const [addModalOpen, setAddModalOpen] = useState(false);

    // Date range
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>(getDefaultRange);
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);
    useEffect(() => {
        if (typeof window !== "undefined") {
            const r = loadDateRange();
            setDateRange(r);
            setCalRange({ from: r.start, to: r.end });
        }
    }, []);

    const handleCalSelect = (range: DateRange | undefined) => {
        setCalRange(range);
        if (range?.from && range?.to) {
            setDateRange({ start: range.from, end: range.to });
            saveDateRange(range.from, range.to);
            setDatePickerOpen(false);
        }
    };

    // Grouping toggle
    type GroupBy = "region" | "status" | "all";
    const [groupBy, setGroupBy] = useState<GroupBy>(() =>
        readStorage<GroupBy>("campwatch:watchlist-grouping", "region"),
    );
    const handleGroupBy = (v: GroupBy) => {
        setGroupBy(v);
        writeStorage("campwatch:watchlist-grouping", v);
    };

    // Favorites
    const [favorites, setFavorites] = useState<Set<string>>(() => {
        if (typeof window === "undefined") return new Set();
        try {
            const raw = localStorage.getItem("campwatch:favorites");
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
        } catch { return new Set(); }
    });
    const toggleFavorite = (id: string) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            writeStorage("campwatch:favorites", Array.from(next));
            return next;
        });
    };

    // Snoozed openings (by opening key)
    const [snoozedOpenings, setSnoozedOpenings] = useState<Record<string, string>>(() =>
        readStorage<Record<string, string>>("campwatch:snoozed-openings", {}),
    );
    const toggleSnoozeOpening = useCallback((id: string) => {
        setSnoozedOpenings((prev) => {
            const next = { ...prev };
            if (id in next) { delete next[id]; } else { next[id] = snoozeUntilDate(); }
            writeStorage("campwatch:snoozed-openings", next);
            return next;
        });
    }, []);

    // Snoozed campgrounds (by cg id)
    const [snoozedCgs, setSnoozedCgs] = useState<Set<string>>(() => {
        const raw = readStorage<Record<string, string>>("campwatch:snoozed-cgs", {});
        return new Set(Object.keys(raw));
    });
    const toggleSnoozeCg = useCallback((id: string) => {
        setSnoozedCgs((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            // Persist as {id: until} map
            const map: Record<string, string> = {};
            next.forEach((k) => { map[k] = snoozeUntilDate(); });
            writeStorage("campwatch:snoozed-cgs", map);
            return next;
        });
    }, []);

    const settings = useMemo<SiteSettingsValue>(
        () => ({
            dates: {
                stayLengths: globalSettings.stayLengths,
                validStartDays: globalSettings.validStartDays,
            },
            views: { type: "calendar" as const },
            dev: { useMockData },
        }),
        [globalSettings, useMockData],
    );

    const { campgroundsByAreas, isFetching, progressBarData, refresh } = useCampgroundsData({
        siteConfig,
        settings,
        useMockData,
        enabled: !isHydrating,
    });

    // Rating change handler
    const handleRatingChange = (
        campgroundId: string,
        siteName: string,
        newRating: "favorite" | "worthwhile" | "unrated",
    ) => {
        const campgrounds = siteConfig["recreation.gov"] ?? [];
        const updated = campgrounds.map((cg) => {
            if (cg.id !== campgroundId) return cg;
            const favorites = (cg.sites?.favorites ?? []).filter((s) => s !== siteName);
            const worthwhile = (cg.sites?.worthwhile ?? []).filter((s) => s !== siteName);
            if (newRating === "favorite") favorites.push(siteName);
            else if (newRating === "worthwhile") worthwhile.push(siteName);
            return { ...cg, sites: { favorites, worthwhile } };
        });
        void save({ ...siteConfig, "recreation.gov": updated }, globalSettings);
    };

    useEffect(() => {
        if (syncStatus === null) return;
        if (syncStatus === "success") { toast.success("Settings synced to notifications"); }
        else { toast.warning("Settings saved locally but failed to sync"); }
        clearSyncStatus();
    }, [syncStatus, clearSyncStatus]);

    const isLoading = isFetching || isHydrating;
    const isEmpty = !userCampgrounds.isHydrating && userCampgrounds.isEmpty;

    const topBarMenuItems = [
        { label: "Configure Sites", action: () => setIsConfigDialogOpen(true) },
        { label: isLoading ? "Refreshing…" : "Refresh data", action: () => refresh(), disabled: isLoading },
        { label: "Clear cache", action: () => { clearCampgroundCache(); refresh(); }, disabled: isLoading },
    ];

    // Compute open counts within date range
    const openCounts = useMemo(() => {
        const m = new Map<string, number>();
        const winStartIso = toLocalIso(dateRange.start);
        const winEndIso = toLocalIso(dateRange.end);
        for (const c of campgroundsByAreas) {
            const key = c.id ?? c.name;
            const count = Object.values(c.siteAvailability ?? {}).reduce((acc, site) => {
                return acc + (site.matches ?? []).filter((match) => match.from <= winEndIso && match.to > winStartIso).length;
            }, 0);
            m.set(key, count);
        }
        return m;
    }, [campgroundsByAreas, dateRange]);

    // Status sentence count (campgrounds with at least one match in window)
    const campgroundsWithOpenings = useMemo(() =>
        campgroundsByAreas.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) > 0).length,
        [campgroundsByAreas, openCounts],
    );

    // Openings feed: recent matches
    const openingItems = useMemo((): OpeningItem[] => {
        const todayIso = toLocalIso(new Date());
        const thirtyDaysOut = toLocalIso(new Date(Date.now() + 30 * 86400_000));
        const items: OpeningItem[] = [];

        for (const c of campgroundsByAreas) {
            for (const site of Object.values(c.siteAvailability ?? {})) {
                for (const m of site.matches ?? []) {
                    if (m.from >= todayIso && m.from <= thirtyDaysOut) {
                        const id = `${c.id ?? c.name}-${site.siteId}-${m.from}`;
                        if (id in snoozedOpenings) continue;
                        items.push({
                            id,
                            campgroundName: c.name,
                            siteId: site.siteId,
                            siteName: site.siteName,
                            from: m.from,
                            to: m.to,
                            nights: m.nights,
                            recGovId: c.id,
                            isSnoozed: id in snoozedOpenings,
                        });
                    }
                }
            }
        }

        items.sort((a, b) => a.from.localeCompare(b.from));
        return items.slice(0, 6);
    }, [campgroundsByAreas, snoozedOpenings]);

    // Watchlist groups
    const watchlistGroups = useMemo(() => {
        const rows = campgroundsByAreas;
        if (groupBy === "all") {
            return [{ label: "All Campgrounds", rows }];
        }
        if (groupBy === "status") {
            const hasOpenings = rows.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) > 0);
            const quiet = rows.filter((c) => (openCounts.get(c.id ?? c.name) ?? 0) === 0);
            const groups = [];
            if (hasOpenings.length > 0) groups.push({ label: "Has openings", rows: hasOpenings });
            if (quiet.length > 0) groups.push({ label: "Quiet", rows: quiet });
            return groups;
        }
        // By region: group by area
        const areaMap = new Map<string, ProcessedCampground[]>();
        for (const c of rows) {
            const key = c.area ?? "Other";
            const arr = areaMap.get(key) ?? [];
            arr.push(c);
            areaMap.set(key, arr);
        }
        return Array.from(areaMap.entries()).map(([label, rows]) => ({ label, rows }));
    }, [campgroundsByAreas, groupBy, openCounts]);

    const PAD = isMobile ? 22 : 36;
    const userName = auth.user?.name?.split(" ")[0] ?? "there";

    return (
        <>
            <style>{`
                @keyframes cw-pulse {
                    0%  { transform: scale(0.6); opacity: 0.9; }
                    100%{ transform: scale(2.4); opacity: 0; }
                }
                .cw-tb-add:hover { opacity: 0.85; }
            `}</style>

            <SiteSettingsContext.Provider value={settings}>
                <ProgressBarContext.Provider value={progressBarData}>
                    <TopBar
                        title={siteData.name ?? ""}
                        subtitle={siteData.tagline ?? ""}
                        logo={{ src: "/images/logos/CampWatch_Logo_trimmed.png", alt: "Camp Watch logo", height: 36 }}
                        menuItems={topBarMenuItems}
                        isRefreshing={isLoading}
                        auth={auth}
                        actionItems={
                            <button
                                className="cw-tb-add"
                                onClick={() => setAddModalOpen(true)}
                                style={{
                                    font: `700 11px/1 ${FM}`, letterSpacing: "0.14em", textTransform: "uppercase",
                                    background: CW.ink, color: CW.cream, border: `1.5px solid ${CW.ink}`,
                                    padding: "8px 12px", cursor: "pointer", borderRadius: 2,
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    transition: "opacity .14s",
                                }}
                            >
                                + Add campground
                            </button>
                        }
                    />
                    <ProgressBarEl />

                    <main style={{ background: CW.paper, color: CW.ink, fontFamily: FB, minHeight: "100vh" }}>

                        {/* Missing-from-default sync banner */}
                        {userCampgrounds.missingFromDefault.length > 0 && !dismissedSync && (
                            <div style={{ padding: `12px ${PAD}px` }}>
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                                    <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                            {userCampgrounds.missingFromDefault.length} new campground{userCampgrounds.missingFromDefault.length === 1 ? "" : "s"} in the default config
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {userCampgrounds.missingFromDefault.map((c) => c.name).join(", ")}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Button size="sm" onClick={async () => {
                                            const result = await userCampgrounds.syncMissing();
                                            setDismissedSync(true);
                                            toast.success(`Added ${result.added} campground${result.added === 1 ? "" : "s"}`);
                                        }}>
                                            Add to my list
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => setDismissedSync(true)} aria-label="Dismiss">
                                            <X className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Empty state ── */}
                        {isEmpty ? (
                            <EmptyState onClone={cloneDefault} isMobile={isMobile} />
                        ) : (
                            <>
                                {/* ── Greeting ── */}
                                <section style={{ padding: `40px ${PAD}px 8px`, position: "relative" }}>
                                    <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 14, textTransform: "uppercase" }}>
                                        {formatDateEyebrow()}
                                    </div>
                                    <h1 style={{ margin: "0 0 14px", letterSpacing: "-0.005em" }}>
                                        <span style={{ font: `900 ${isMobile ? 38 : 56}px/0.95 ${FH}`, textTransform: "uppercase", display: "inline" }}>
                                            GOOD {getTimeOfDay().toUpperCase()},
                                        </span>
                                        <span style={{ font: `500 italic ${isMobile ? 38 : 56}px/0.95 ${FI}`, color: CW.forest, marginLeft: 14, letterSpacing: "-0.01em" }}>
                                            {userName}.
                                        </span>
                                    </h1>
                                    <p style={{ font: `400 ${isMobile ? 14 : 18}px/1.5 ${FB}`, color: CW.inkSoft, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                        <Pulse color={CW.forest} size={7} />
                                        {isLoading
                                            ? "Checking your campgrounds…"
                                            : campgroundsWithOpenings > 0
                                                ? <><strong style={{ color: CW.ink }}>{campgroundsWithOpenings} campground{campgroundsWithOpenings !== 1 ? "s" : ""}</strong>&nbsp;have bookable sites for your dates.</>
                                                : "No bookable sites found in your date window — we're still watching."}
                                    </p>
                                </section>

                                {/* ── Openings feed ── */}
                                <section style={{ padding: isMobile ? `28px 0 12px` : `40px ${PAD}px 28px` }}>
                                    <div style={{ padding: isMobile ? `0 ${PAD}px` : 0, marginBottom: 20 }}>
                                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                                            <div>
                                                <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 8, textTransform: "uppercase" }}>
                                                    § I — STILL BOOKABLE
                                                </div>
                                                <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                                                    <span style={{ font: `900 ${isMobile ? 22 : 32}px/1 ${FH}`, textTransform: "uppercase", display: "inline" }}>OPEN RIGHT NOW</span>
                                                    <span style={{ font: `500 italic ${isMobile ? 22 : 32}px/1 ${FI}`, color: CW.forest, marginLeft: 12, letterSpacing: "-0.01em" }}>
                                                        across your watchlist.
                                                    </span>
                                                </h2>
                                            </div>
                                        </div>
                                    </div>

                                    {openingItems.length === 0 ? (
                                        <div style={{ padding: isMobile ? `0 ${PAD}px` : 0, font: `400 italic 16px/1.5 ${FI}`, color: CW.inkSubtle }}>
                                            No new openings today. We&apos;re still watching.
                                        </div>
                                    ) : isMobile ? (
                                        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: `4px ${PAD}px 16px`, scrollSnapType: "x mandatory" }}>
                                            {openingItems.map((item) => (
                                                <OpeningCard key={item.id} item={item} isMobile onSnooze={toggleSnoozeOpening} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(openingItems.length, 3)}, 1fr)`, gap: 18 }}>
                                            {openingItems.map((item) => (
                                                <OpeningCard key={item.id} item={item} isMobile={false} onSnooze={toggleSnoozeOpening} />
                                            ))}
                                        </div>
                                    )}
                                </section>

                                {/* ── Watchlist ── */}
                                <section style={{ padding: `24px ${PAD}px 60px`, position: "relative", borderTop: `1.5px solid ${CW.ink}` }}>
                                    <div style={{ paddingTop: 28, marginBottom: 18 }}>
                                        <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                                            § II — THE WATCHLIST · {campgroundsByAreas.length} CAMPGROUND{campgroundsByAreas.length !== 1 ? "S" : ""}
                                        </div>
                                        <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                                            <span style={{ font: `900 ${isMobile ? 24 : 32}px/1 ${FH}`, textTransform: "uppercase", display: "inline" }}>EVERY PLACE</span>
                                            <span style={{ font: `500 italic ${isMobile ? 24 : 32}px/1 ${FI}`, color: CW.forest, marginLeft: 10, letterSpacing: "-0.01em" }}>
                                                you&apos;re watching.
                                            </span>
                                        </h2>
                                    </div>

                                    {/* Toolbar */}
                                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
                                        {/* Group toggle */}
                                        <div style={{ display: "inline-flex", border: `1px solid ${CW.ink}`, borderRadius: 2, overflow: "hidden" }}>
                                            {(["region", "status", "all"] as const).map((v, i) => (
                                                <button
                                                    key={v}
                                                    onClick={() => handleGroupBy(v)}
                                                    style={{
                                                        font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                                                        background: groupBy === v ? CW.ink : "transparent",
                                                        color: groupBy === v ? CW.cream : CW.ink,
                                                        border: "none",
                                                        borderLeft: i === 0 ? "none" : `1px solid ${CW.rule}`,
                                                        padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer",
                                                    }}
                                                >
                                                    {v === "region" ? "By Region" : v === "status" ? "By Status" : "All"}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Date picker */}
                                        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                                            <PopoverTrigger asChild>
                                                <button style={{
                                                    font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                                                    background: "transparent", color: CW.ink, border: `1px solid ${CW.rule}`,
                                                    padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer", borderRadius: 2,
                                                    display: "inline-flex", alignItems: "center", gap: 8,
                                                }}>
                                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                                                        <rect x="1.5" y="3" width="11" height="10" rx="1" />
                                                        <path d="M1.5 6 H12.5" />
                                                        <path d="M4 1.5 V4 M10 1.5 V4" />
                                                    </svg>
                                                    Pick dates →
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="range"
                                                    selected={calRange}
                                                    onSelect={handleCalSelect}
                                                    numberOfMonths={isMobile ? 1 : 2}
                                                />
                                            </PopoverContent>
                                        </Popover>

                                        <span style={{ font: `500 italic 14px/1 ${FI}`, color: CW.inkSoft }}>
                                            {formatShortRange(dateRange.start, dateRange.end)}
                                        </span>

                                        {/* Legend */}
                                        {!isMobile && (
                                            <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center", font: `400 italic 13px/1 ${FI}`, color: CW.inkSoft }}>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                                    <span style={{ width: 8, height: 8, background: CW.forest, borderRadius: 2 }} />open
                                                </span>
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                                    <span style={{ width: 8, height: 8, background: CW.inkFaint, borderRadius: 2 }} />booked
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Groups */}
                                    {isLoading && campgroundsByAreas.length === 0 ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <div key={i} className="animate-pulse" style={{ height: 56, background: CW.cream, border: `1px solid ${CW.rule}`, borderRadius: 2 }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: "grid", gap: 28 }}>
                                            {watchlistGroups.map((group, gi) => {
                                                const openInGroup = group.rows.reduce((sum, c) => sum + (openCounts.get(c.id ?? c.name) ?? 0), 0);
                                                return (
                                                    <div key={group.label}>
                                                        {groupBy !== "all" && (
                                                            <GroupHeader index={gi} label={group.label} count={group.rows.length} openInGroup={openInGroup} />
                                                        )}
                                                        <WatchlistTable
                                                            rows={group.rows}
                                                            showHeader={gi === 0}
                                                            favorites={favorites}
                                                            onToggleFavorite={toggleFavorite}
                                                            openCounts={openCounts}
                                                            windowStart={dateRange.start}
                                                            windowEnd={dateRange.end}
                                                            settings={settings as { views?: { type?: "calendar" | "table" } }}
                                                            globalSettings={globalSettings}
                                                            isMobile={isMobile}
                                                            snoozedCgs={snoozedCgs}
                                                            onSnoozeCg={toggleSnoozeCg}
                                                            onRatingChange={handleRatingChange}
                                                            onEditSettings={(id) => {
                                                                setFocusedCampgroundId(id);
                                                                setIsConfigDialogOpen(true);
                                                            }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}

                        {/* Footer */}
                        <footer style={{ padding: `20px ${PAD}px 36px`, display: "flex", justifyContent: "space-between", font: `500 11px/1 ${FM}`, letterSpacing: "0.12em", color: CW.inkFaint, textTransform: "uppercase", flexWrap: "wrap", gap: 8 }}>
                            <span>Built by a camper, for campers</span>
                            <span>{siteData.name}</span>
                        </footer>
                    </main>

                    <SiteConfigDialog
                        open={isConfigDialogOpen}
                        onClose={() => { setIsConfigDialogOpen(false); setFocusedCampgroundId(null); }}
                        onSave={(config, nextGlobal) => { void save(config, nextGlobal); setIsConfigDialogOpen(false); setFocusedCampgroundId(null); }}
                        onResetToDefaults={() => void cloneDefault()}
                        initialData={siteConfig}
                        globalSettings={globalSettings}
                        availableSites={{}}
                        useMockData={false}
                        onToggleMockData={() => {}}
                        focusedCampgroundId={focusedCampgroundId}
                    />
                </ProgressBarContext.Provider>
            </SiteSettingsContext.Provider>

            <AddCampgroundModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
        </>
    );
}
