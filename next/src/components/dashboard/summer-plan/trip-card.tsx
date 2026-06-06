import { CW } from "@/components/field-notes/cw-tokens";
import { TIER_MARK } from "@/lib/timeline";
import type { PlannedTrip } from "@/lib/summer-planner";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    return `${WEEKDAY[date.getDay()]} ${MON[date.getMonth()]} ${date.getDate()}`;
}

export function TripCard({
    trip,
    index,
    onToggleLock,
    onSwap,
}: {
    trip: PlannedTrip;
    index: number;
    onToggleLock: (id: string) => void;
    onSwap: (id: string) => void;
}) {
    return (
        <div
            className="flex flex-col gap-2 bg-cw-cream p-4"
            style={{ border: `1.5px solid ${CW.ink}`, boxShadow: `4px 4px 0 ${CW.forest}` }}
        >
            <div className="flex items-center justify-between gap-3">
                <span
                    className="font-mono-field font-bold uppercase"
                    style={{ fontSize: 11, letterSpacing: "0.16em", color: CW.clay }}
                >
                    Trip {index + 1}
                </span>
                <span className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => onToggleLock(trip.id)}
                        aria-pressed={trip.locked}
                        className="font-mono-field uppercase"
                        style={{
                            fontSize: 10,
                            letterSpacing: "0.1em",
                            color: trip.locked ? CW.forest : CW.inkFaint,
                        }}
                    >
                        {trip.locked ? "★ Locked" : "Lock"}
                    </button>
                    {!trip.locked && (
                        <button
                            type="button"
                            onClick={() => onSwap(trip.id)}
                            className="font-mono-field uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.1em", color: CW.inkFaint }}
                        >
                            Swap
                        </button>
                    )}
                </span>
            </div>
            <div className="font-italic-serif italic" style={{ fontSize: 22, color: CW.ink }}>
                {trip.campgroundName}
            </div>
            {trip.area && (
                <div className="font-body-serif" style={{ fontSize: 12, color: CW.inkSoft }}>
                    {trip.area}
                </div>
            )}
            <div className="font-body-serif" style={{ fontSize: 14, color: CW.ink }}>
                {fmt(trip.from)} – {fmt(trip.to)} · {trip.nights}n
                {trip.includesWeekend && (
                    <span
                        className="ml-2 font-mono-field uppercase"
                        style={{ fontSize: 9, letterSpacing: "0.1em", color: CW.clay }}
                    >
                        incl. weekend
                    </span>
                )}
            </div>
            <div className="font-mono-field" style={{ fontSize: 12, color: CW.ink }}>
                <span
                    style={{
                        color:
                            trip.tier === "fav" ? CW.clay : trip.tier === "worth" ? CW.forest : CW.inkFaint,
                    }}
                >
                    {TIER_MARK[trip.tier]}
                </span>{" "}
                Site {trip.siteName}
            </div>
            <a
                href={trip.bookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-center font-poster font-extrabold uppercase"
                style={{
                    background: CW.forest,
                    color: CW.cream,
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    padding: "10px",
                }}
            >
                Book on recreation.gov →
            </a>
        </div>
    );
}
