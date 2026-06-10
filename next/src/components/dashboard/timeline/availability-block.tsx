import { CW } from "@/components/field-notes/cw-tokens";
import { type Horizon, dateAt, isWeekendNight, pct, rangeLabel } from "@/lib/timeline";
import { isDateBlackedOut } from "@/lib/blackout";
import type { BlackoutRange } from "@/types/campground";
import { toLocalIso } from "@/components/dashboard/helpers";

interface AvailabilityBlockProps {
    horizon: Horizon;
    /** inclusive night index range */
    run: [number, number];
    kind: "open" | "limited";
    /** thin site-row bar variant */
    site?: boolean;
    /** favorite-site openings get a clay ring */
    ring?: boolean;
    /** user's blackout ranges — blacked-out nights render grey */
    blackoutDates?: BlackoutRange[];
}

const LIMITED_WEEKDAY = `repeating-linear-gradient(45deg, ${CW.mustard} 0 5px, color-mix(in srgb, ${CW.mustard} 40%, transparent) 5px 10px)`;

function segBackground(kind: "open" | "limited", weekend: boolean): string {
    if (kind === "open") return weekend ? CW.forestBright : CW.forest;
    return weekend ? CW.mustard : LIMITED_WEEKDAY;
}

export function AvailabilityBlock({ horizon, run, kind, site, ring, blackoutDates }: AvailabilityBlockProps) {
    const [s, e] = run;
    const left = pct(horizon, s);
    const width = pct(horizon, e - s + 1);
    const nights = e - s + 1;
    const label = rangeLabel(horizon, s, e);
    const tip = `${label} · ${nights} night${nights > 1 ? "s" : ""}`;

    // Width-tiered label: never clip text.
    let inline: React.ReactNode = null;
    let showTag = false;
    if (site) {
        if (width >= 6.5)
            inline = <span className="relative z-[1] font-mono-field text-[8px] font-semibold">{label}</span>;
        else showTag = true;
    } else if (width >= 11) {
        inline = (
            <>
                <span className="relative z-[1] font-mono-field text-[11px] font-semibold tracking-[0.02em]">
                    {label}
                </span>
                {kind === "open" && (
                    <span
                        className="relative z-[1] ml-[7px] font-italic-serif text-[12px] italic"
                        style={{ color: "rgba(251,246,234,0.82)" }}
                    >
                        {nights} nts
                    </span>
                )}
            </>
        );
    } else if (width >= 6.5) {
        inline = (
            <span className="relative z-[1] font-mono-field text-[11px] font-semibold tracking-[0.02em]">
                {label}
            </span>
        );
    } else {
        showTag = true;
    }

    const labelColor = kind === "open" ? CW.cream : "#3a2f06";
    const baseShadow =
        kind === "open" ? "0 2px 6px -2px rgba(20,42,29,.6)" : "0 2px 6px -3px rgba(201,162,39,.7)";
    const boxShadow = ring ? `0 0 0 1.5px ${CW.clay}, ${baseShadow}` : baseShadow;

    const segs: React.ReactNode[] = [];
    for (let i = s; i <= e; i++) {
        const nightDate = dateAt(horizon, i);
        const weekend = isWeekendNight(nightDate);
        const nightIso = toLocalIso(nightDate);
        const blacked = isDateBlackedOut(nightIso, blackoutDates);
        const bg = blacked ? CW.inkFaint : segBackground(kind, weekend);
        segs.push(<div key={i} className="flex-1" style={{ background: bg }} />);
    }

    return (
        <div
            className={`group absolute top-1/2 flex -translate-y-1/2 items-center justify-center overflow-visible whitespace-nowrap px-2 ${
                site ? "h-[15px] rounded-[4px]" : "h-6 rounded-[5px]"
            }`}
            style={{ left: `${left}%`, width: `${width}%`, minWidth: 7, boxShadow, color: labelColor }}
            title={tip}
        >
            <div className="absolute inset-0 flex overflow-hidden rounded-[inherit]">{segs}</div>
            {inline}
            {showTag && (
                <span
                    className="pointer-events-none absolute left-1/2 bottom-[calc(100%+4px)] z-[3] -translate-x-1/2 whitespace-nowrap rounded-[4px] px-[6px] py-[3px] font-mono-field text-[10px] font-semibold tracking-[0.02em] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ background: CW.ink, color: CW.cream }}
                >
                    {tip}
                </span>
            )}
        </div>
    );
}
