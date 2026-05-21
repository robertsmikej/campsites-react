"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { formatTimeAgo } from "@/components/dashboard/helpers";
import { OpeningSnoozeButton } from "./opening-snooze-button";
import type { OpeningItem } from "./openings-feed";

const CANCEL_THRESHOLD_DAYS = 14;

// ─── Pulse dot ───────────────────────────────────────────────────────────────
function Pulse({ color, size = 7 }: { color: string; size?: number }) {
    return (
        <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
            <span style={{ position: "absolute", inset: -3, borderRadius: "50%", border: `1px solid ${color}`, opacity: 0.4, animation: "cw-pulse 1.8s ease-out infinite" }} />
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
    onSnooze: (id: string) => void;
    nowMs: number;
}

export function OpeningCard({ item, isMobile, onSnooze, nowMs }: OpeningCardProps) {
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
                boxShadow: isMobile ? `4px 4px 0 ${CW.forest}` : `6px 6px 0 ${CW.forest}`,
                padding: isMobile ? "16px 18px" : "20px 22px 18px",
                gap: isMobile ? 12 : 14,
                minWidth: isMobile ? 270 : undefined,
                scrollSnapAlign: isMobile ? "start" : undefined,
                flexShrink: isMobile ? 0 : undefined,
            }}
        >
            <div className="flex items-center gap-2">
                <Pulse color={tagColor} size={6} />
                <span className="font-mono-field text-[10px] font-bold leading-none tracking-[0.18em] uppercase" style={{ color: tagColor }}>
                    {tag}
                </span>
                <span className="font-mono-field text-[10px] font-medium leading-none ml-auto text-cw-ink-subtle">
                    {timeAgo}
                </span>
            </div>
            <div>
                <div className="font-poster font-black leading-[1.1] uppercase tracking-[0.005em]" style={{ fontSize: isMobile ? 17 : 20 }}>
                    {item.campgroundName}
                </div>
                {item.siteName && (
                    <div className="font-italic-serif font-medium italic leading-[1.3] text-cw-ink-soft mt-1" style={{ fontSize: isMobile ? 13 : 15 }}>
                        Site {item.siteName}
                    </div>
                )}
            </div>
            <div className="border-t border-dashed border-cw-rule" style={{ paddingTop: isMobile ? 10 : 12 }}>
                <div className="font-body-serif font-semibold leading-[1.2] text-cw-ink" style={{ fontSize: isMobile ? 14 : 16 }}>
                    {formatOpeningDates(item.from, item.to)}
                </div>
                <div className="font-mono-field text-[11px] font-medium leading-none tracking-[0.12em] text-cw-ink-soft mt-1 uppercase">
                    {item.nights} night{item.nights !== 1 ? "s" : ""}
                </div>
            </div>
            <a
                href={recGovUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-poster font-black leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream no-underline text-center rounded-[2px] inline-flex items-center justify-center gap-2"
                style={{
                    fontSize: isMobile ? 11 : 12,
                    padding: isMobile ? "12px" : "13px 14px",
                }}
            >
                Book on rec.gov ↗
            </a>
            <OpeningSnoozeButton itemId={item.id} onSnooze={onSnooze} />
        </article>
    );
}
