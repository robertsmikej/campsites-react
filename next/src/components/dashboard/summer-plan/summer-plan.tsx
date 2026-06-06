"use client";

import { useEffect, useMemo, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { monthWindow, planSummer } from "@/lib/summer-planner";
import type { ProcessedCampground } from "@/types/campground";
import { TripCard } from "./trip-card";
import { SummerStrip } from "./summer-strip";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Months offered in the window pickers (Apr–Oct covers any realistic camping season).
const MONTH_OPTIONS = [3, 4, 5, 6, 7, 8, 9];
const MIN_TRIPS = 2;
const MAX_TRIPS = 8;

const PREFS_KEY = "campwatch:plan-prefs";
interface PlanPrefs {
    startMonth: number;
    endMonth: number;
    tripCount: number;
}
const DEFAULT_PREFS: PlanPrefs = { startMonth: 5, endMonth: 8, tripCount: 5 }; // Jun–Sep, 5 trips

function loadPlanPrefs(): PlanPrefs | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return null;
        const p = JSON.parse(raw) as Partial<PlanPrefs>;
        if (
            typeof p.startMonth !== "number" ||
            typeof p.endMonth !== "number" ||
            typeof p.tripCount !== "number"
        ) {
            return null;
        }
        return { startMonth: p.startMonth, endMonth: p.endMonth, tripCount: p.tripCount };
    } catch {
        return null;
    }
}

function savePlanPrefs(prefs: PlanPrefs): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
        // ignore storage errors
    }
}

export function SummerPlan({ rows, seasonYear }: { rows: ProcessedCampground[]; seasonYear: number }) {
    // Default first to avoid SSR/hydration mismatch; hydrate from storage on mount.
    const [prefs, setPrefs] = useState<PlanPrefs>(DEFAULT_PREFS);
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [exclude, setExclude] = useState<Set<string>>(new Set());

    useEffect(() => {
        const stored = loadPlanPrefs();
        if (stored) setPrefs(stored);
    }, []);
    useEffect(() => {
        savePlanPrefs(prefs);
    }, [prefs]);
    // A changed window or trip count means a fresh plan — drop the swap/regenerate exclusions.
    useEffect(() => {
        setExclude(new Set());
    }, [prefs.startMonth, prefs.endMonth, prefs.tripCount, seasonYear]);

    const window = useMemo(
        () => monthWindow(seasonYear, prefs.startMonth, prefs.endMonth),
        [seasonYear, prefs.startMonth, prefs.endMonth],
    );

    const plan = useMemo(
        () =>
            planSummer(rows, {
                window,
                targetTrips: prefs.tripCount,
                lockedTripIds: [...locked],
                excludeTripIds: [...exclude],
            }),
        [rows, window, prefs.tripCount, locked, exclude],
    );

    const setStartMonth = (m: number) =>
        setPrefs((p) => ({ ...p, startMonth: m, endMonth: Math.max(m, p.endMonth) }));
    const setEndMonth = (m: number) =>
        setPrefs((p) => ({ ...p, endMonth: m, startMonth: Math.min(m, p.startMonth) }));
    const bumpTrips = (delta: number) =>
        setPrefs((p) => ({ ...p, tripCount: Math.min(MAX_TRIPS, Math.max(MIN_TRIPS, p.tripCount + delta)) }));

    const toggleLock = (id: string) =>
        setLocked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const swap = (id: string) => setExclude((prev) => new Set(prev).add(id));
    const regenerate = () =>
        setExclude((prev) => {
            const next = new Set(prev);
            for (const t of plan.trips) if (!t.locked) next.add(t.id);
            return next;
        });
    const reset = () => {
        setExclude(new Set());
        setLocked(new Set());
    };

    const selectStyle: React.CSSProperties = {
        background: CW.cream,
        border: `1.5px solid ${CW.ink}`,
        borderRadius: 3,
        padding: "6px 8px",
        color: CW.ink,
    };
    const stepBtnStyle: React.CSSProperties = {
        width: 30,
        height: 30,
        border: `1.5px solid ${CW.ink}`,
        background: CW.cream,
        color: CW.ink,
        lineHeight: 1,
    };

    return (
        <div>
            {/* Summary + primary actions */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkSoft }}>
                    {plan.stats.tripCount} trip{plan.stats.tripCount === 1 ? "" : "s"} ·{" "}
                    {plan.stats.campgroundCount} campground{plan.stats.campgroundCount === 1 ? "" : "s"} ·{" "}
                    {plan.stats.weekendCount} include a weekend · {MON[window.start.getMonth()]}–
                    {MON[window.end.getMonth()]}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={regenerate}
                        className="font-poster font-extrabold uppercase"
                        style={{
                            background: CW.forest,
                            color: CW.cream,
                            fontSize: 11,
                            letterSpacing: "0.12em",
                            padding: "10px 16px",
                            border: `1.5px solid ${CW.forest}`,
                        }}
                    >
                        Regenerate
                    </button>
                    <button
                        type="button"
                        onClick={reset}
                        className="font-poster font-extrabold uppercase"
                        style={{
                            background: CW.paper,
                            color: CW.ink,
                            fontSize: 11,
                            letterSpacing: "0.12em",
                            padding: "10px 16px",
                            border: `1.5px solid ${CW.ink}`,
                        }}
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Window + trip-count controls */}
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <label className="flex items-center gap-2">
                    <span
                        className="font-mono-field font-bold uppercase"
                        style={{ fontSize: 10, letterSpacing: "0.16em", color: CW.clay }}
                    >
                        Window
                    </span>
                    <select
                        aria-label="Start month"
                        value={prefs.startMonth}
                        onChange={(e) => setStartMonth(Number(e.target.value))}
                        className="font-mono-field"
                        style={selectStyle}
                    >
                        {MONTH_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                                {MON[m]}
                            </option>
                        ))}
                    </select>
                    <span style={{ color: CW.inkSoft }}>–</span>
                    <select
                        aria-label="End month"
                        value={prefs.endMonth}
                        onChange={(e) => setEndMonth(Number(e.target.value))}
                        className="font-mono-field"
                        style={selectStyle}
                    >
                        {MONTH_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                                {MON[m]}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="flex items-center gap-2">
                    <span
                        className="font-mono-field font-bold uppercase"
                        style={{ fontSize: 10, letterSpacing: "0.16em", color: CW.clay }}
                    >
                        Trips
                    </span>
                    <button
                        type="button"
                        aria-label="Fewer trips"
                        onClick={() => bumpTrips(-1)}
                        disabled={prefs.tripCount <= MIN_TRIPS}
                        className="font-poster font-extrabold disabled:opacity-40"
                        style={stepBtnStyle}
                    >
                        −
                    </button>
                    <span
                        className="font-mono-field font-bold tabular-nums"
                        style={{ fontSize: 14, color: CW.ink, minWidth: 16, textAlign: "center" }}
                    >
                        {prefs.tripCount}
                    </span>
                    <button
                        type="button"
                        aria-label="More trips"
                        onClick={() => bumpTrips(1)}
                        disabled={prefs.tripCount >= MAX_TRIPS}
                        className="font-poster font-extrabold disabled:opacity-40"
                        style={stepBtnStyle}
                    >
                        +
                    </button>
                </div>
            </div>

            {plan.trips.length === 0 ? (
                <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkFaint }}>
                    No openings in this window yet — widen it or check back as sites free up.
                </div>
            ) : (
                <>
                    <div className="mb-5">
                        <SummerStrip window={window} trips={plan.trips} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {plan.trips.map((t, i) => (
                            <TripCard key={t.id} trip={t} index={i} onToggleLock={toggleLock} onSwap={swap} />
                        ))}
                    </div>
                </>
            )}

            {plan.notes.length > 0 && (
                <ul className="mt-4 space-y-1">
                    {plan.notes.map((n, i) => (
                        <li
                            key={i}
                            className="font-italic-serif italic"
                            style={{ fontSize: 13, color: CW.inkSoft }}
                        >
                            {n}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
