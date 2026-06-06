"use client";

import { useMemo, useState } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { planSummer, type PlanWindow } from "@/lib/summer-planner";
import type { ProcessedCampground } from "@/types/campground";
import { TripCard } from "./trip-card";
import { SummerStrip } from "./summer-strip";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function SummerPlan({ rows, window }: { rows: ProcessedCampground[]; window: PlanWindow }) {
    const [locked, setLocked] = useState<Set<string>>(new Set());
    const [exclude, setExclude] = useState<Set<string>>(new Set());

    const plan = useMemo(
        () =>
            planSummer(rows, {
                window,
                targetTrips: 5,
                lockedTripIds: [...locked],
                excludeTripIds: [...exclude],
            }),
        [rows, window, locked, exclude],
    );

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

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

            {plan.trips.length === 0 ? (
                <div className="font-italic-serif italic" style={{ fontSize: 16, color: CW.inkFaint }}>
                    No summer openings yet — check back as sites free up.
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
