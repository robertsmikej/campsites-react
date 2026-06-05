import { CW } from "@/components/field-notes/cw-tokens";
import { type Horizon, monthTicks, pct } from "@/lib/timeline";

interface TimelineAxisProps {
    horizon: Horizon;
    /** smaller type for the mobile sticky axis */
    compact?: boolean;
}

export function TimelineAxis({ horizon, compact }: TimelineAxisProps) {
    const ticks = monthTicks(horizon);
    return (
        <div className="relative" style={{ height: compact ? 24 : 30 }}>
            {ticks.map((t) => (
                <div
                    key={`${t.year}-${t.label}`}
                    className="absolute bottom-0 font-poster font-black uppercase leading-none"
                    style={{
                        left: `${pct(horizon, t.index)}%`,
                        paddingBottom: 10,
                        fontSize: compact ? 12 : 15,
                        letterSpacing: "0.04em",
                        color: CW.ink,
                    }}
                >
                    {t.label}
                    <span
                        className="block font-mono-field leading-none"
                        style={{ fontSize: 9, letterSpacing: "0.1em", color: CW.inkSoft, marginTop: 3 }}
                    >
                        {t.year}
                    </span>
                </div>
            ))}
        </div>
    );
}
