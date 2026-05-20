"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FB, FM } from "@/components/field-notes/tokens";
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
                <Pulse color={tagColor} size={6} />
                <span style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: tagColor, textTransform: "uppercase" }}>
                    {tag}
                </span>
                <span style={{ font: `500 10px/1 ${FM}`, color: CW.inkSubtle, marginLeft: "auto" }}>
                    {timeAgo}
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
            <OpeningSnoozeButton itemId={item.id} onSnooze={onSnooze} />
        </article>
    );
}
