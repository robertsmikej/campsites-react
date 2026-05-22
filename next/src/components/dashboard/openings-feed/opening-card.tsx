"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { formatTimeAgo } from "@/components/dashboard/helpers";
import type { OpeningItem } from "./openings-feed";

const CANCEL_THRESHOLD_DAYS = 14;

// ─── Pulse dot ───────────────────────────────────────────────────────────────
function Pulse({ color, size = 7 }: { color: string; size?: number }) {
    return (
        <span
            style={{
                position: "relative",
                display: "inline-block",
                width: size,
                height: size,
                flexShrink: 0,
            }}
        >
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
            <span
                style={{
                    position: "absolute",
                    inset: -3,
                    borderRadius: "50%",
                    border: `1px solid ${color}`,
                    opacity: 0.4,
                    animation: "cw-pulse 1.8s ease-out infinite",
                }}
            />
        </span>
    );
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

interface OpeningCardProps {
    item: OpeningItem;
    isMobile: boolean;
    nowMs: number;
}

export function OpeningCard({ item, isMobile, nowMs }: OpeningCardProps) {
    const recGovUrl = item.recGovId
        ? `https://www.recreation.gov/camping/campgrounds/${item.recGovId}`
        : "https://www.recreation.gov";

    const daysUntilArrival = (new Date(item.from).getTime() - nowMs) / 86_400_000;
    const tag = daysUntilArrival < CANCEL_THRESHOLD_DAYS ? "CANCEL" : "NEW";
    const tagColor = tag === "CANCEL" ? CW.clay : CW.forest;
    const timeAgo = formatTimeAgo(nowMs, item.detectedAt);

    return (
        <article
            className="bg-cw-cream border-[1.5px] border-cw-ink flex flex-col"
            style={{
                boxShadow: `3px 3px 0 ${CW.forest}`,
                padding: isMobile ? "10px 12px" : "10px 12px 9px",
                gap: 6,
                minWidth: isMobile ? 230 : undefined,
                scrollSnapAlign: isMobile ? "start" : undefined,
                flexShrink: isMobile ? 0 : undefined,
            }}
        >
            <div className="flex items-center gap-2">
                <Pulse color={tagColor} size={5} />
                <span
                    className="font-mono-field text-[12px] font-bold leading-none tracking-[0.16em] uppercase"
                    style={{ color: tagColor }}
                >
                    {tag}
                </span>
                <span className="font-mono-field text-[12px] font-medium leading-none ml-auto text-cw-ink-subtle">
                    {timeAgo}
                </span>
            </div>
            <div>
                <div
                    className="font-poster font-black leading-[1.1] uppercase tracking-[0.005em] truncate"
                    style={{ fontSize: 15 }}
                    title={item.campgroundName}
                >
                    {item.campgroundName}
                </div>
                {item.siteName && (
                    <span className="font-italic-serif text-[13px] font-medium italic leading-none text-cw-ink-soft">
                        Site {item.siteName}
                    </span>
                )}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-body-serif text-[13px] font-semibold leading-none text-cw-ink">
                    {formatOpeningDates(item.from, item.to)}
                </span>
                <span className="font-mono-field text-[12px] font-medium leading-none tracking-[0.1em] text-cw-ink-soft uppercase">
                    · {item.nights}n
                </span>
            </div>
            <a
                href={recGovUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono-field text-[12px] font-bold leading-none tracking-[0.14em] uppercase text-cw-forest no-underline hover:underline self-start"
            >
                Book on rec.gov →
            </a>
        </article>
    );
}
