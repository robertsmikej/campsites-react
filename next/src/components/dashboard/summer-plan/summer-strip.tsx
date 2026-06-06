import { CW } from "@/components/field-notes/cw-tokens";
import { buildHorizon, dayIndexOf } from "@/lib/timeline";
import { TimelineAxis } from "@/components/dashboard/timeline/timeline-axis";
import { AvailabilityBlock } from "@/components/dashboard/timeline/availability-block";
import type { PlanWindow, PlannedTrip } from "@/lib/summer-planner";

export function SummerStrip({ window, trips }: { window: PlanWindow; trips: PlannedTrip[] }) {
    const horizon = buildHorizon(window.start, window.end);
    return (
        <div className="overflow-hidden bg-cw-cream" style={{ border: `1.5px solid ${CW.ink}` }}>
            <div style={{ borderBottom: `2px solid ${CW.ink}`, padding: "10px 26px 0" }}>
                <TimelineAxis horizon={horizon} />
            </div>
            <div className="relative" style={{ height: 44, padding: "0 26px" }}>
                <div className="absolute inset-0" style={{ marginLeft: 26, marginRight: 26 }}>
                    {trips.map((t) => {
                        const s = dayIndexOf(horizon, t.from);
                        const e = dayIndexOf(horizon, t.to) - 1; // last night
                        if (e < s) return null;
                        return (
                            <AvailabilityBlock
                                key={t.id}
                                horizon={horizon}
                                run={[Math.max(0, s), Math.min(horizon.totalDays - 1, e)]}
                                kind="open"
                                ring={t.tier === "fav"}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
