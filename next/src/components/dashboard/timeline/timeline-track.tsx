import { CW } from "@/components/field-notes/cw-tokens";
import { type Horizon, dateAt, monthTicks, nowIndex, pct } from "@/lib/timeline";
import type { BlackoutRange } from "@/types/campground";
import { AvailabilityBlock } from "./availability-block";

interface TimelineTrackProps {
    horizon: Horizon;
    open: Array<[number, number]>;
    limited: Array<[number, number]>;
    /** thin per-site track */
    site?: boolean;
    /** clay-ring the open blocks (favorite site) */
    ring?: boolean;
    /** horizontal padding inside the track; defaults to 26 (desktop), pass less on mobile */
    pad?: number;
    /** override height (defaults: 64 summary, 42 site) */
    height?: number;
    /** user's blackout ranges — passed down to AvailabilityBlock for per-night grey */
    blackoutDates?: BlackoutRange[];
}

export function TimelineTrack({
    horizon,
    open,
    limited,
    site,
    ring,
    pad = 26,
    height,
    blackoutDates,
}: TimelineTrackProps) {
    const h = height ?? (site ? 42 : 64);
    const ticks = monthTicks(horizon);
    const now = nowIndex(horizon);

    // Weekend (Fri+Sat) shading columns: one per Friday in the horizon.
    const weekendCols: number[] = [];
    for (let i = 0; i < horizon.totalDays; i++) {
        if (dateAt(horizon, i).getDay() === 5) weekendCols.push(i);
    }

    const hasBlocks = open.length > 0 || limited.length > 0;

    return (
        <div className="relative" style={{ height: h, paddingLeft: pad, paddingRight: pad }}>
            <div className="absolute inset-0" style={{ marginLeft: pad, marginRight: pad }}>
                {/* weekend shading */}
                {weekendCols.map((i) => (
                    <div
                        key={`we-${i}`}
                        className="absolute top-0 bottom-0"
                        style={{
                            left: `${pct(horizon, i)}%`,
                            width: `${pct(horizon, 2)}%`,
                            background: "color-mix(in srgb, var(--cw-clay) 6%, transparent)",
                        }}
                    />
                ))}
                {/* month dividers (skip the first) */}
                {ticks.slice(1).map((t) => (
                    <div
                        key={`div-${t.year}-${t.label}`}
                        className="absolute top-0 bottom-0"
                        style={{ left: `${pct(horizon, t.index)}%`, width: 1, background: CW.rule }}
                    />
                ))}
                {/* NOW line */}
                {now !== null && (
                    <div
                        className="absolute top-0 bottom-0"
                        style={{ left: `${pct(horizon, now)}%`, width: 2, background: CW.clay }}
                    >
                        <span
                            className="absolute font-mono-field font-bold leading-none"
                            style={{ top: 6, left: 5, fontSize: 8, letterSpacing: "0.12em", color: CW.clay }}
                        >
                            NOW
                        </span>
                    </div>
                )}
                {/* blocks: limited first, open on top */}
                {limited.map((run, k) => (
                    <AvailabilityBlock
                        key={`l-${k}`}
                        horizon={horizon}
                        run={run}
                        kind="limited"
                        site={site}
                        blackoutDates={blackoutDates}
                    />
                ))}
                {open.map((run, k) => (
                    <AvailabilityBlock
                        key={`o-${k}`}
                        horizon={horizon}
                        run={run}
                        kind="open"
                        site={site}
                        ring={ring}
                        blackoutDates={blackoutDates}
                    />
                ))}
                {/* booked-all-season for empty site rows */}
                {site && !hasBlocks && (
                    <span
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-italic-serif italic"
                        style={{ fontSize: 14, color: CW.inkFaint, letterSpacing: "0.02em" }}
                    >
                        booked all season
                    </span>
                )}
            </div>
        </div>
    );
}
