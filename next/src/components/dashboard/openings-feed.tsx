"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FB, FM } from "@/components/field-notes/tokens";
import { readStorage, formatTimeAgo, formatSnoozeLabel, snoozeUntilDate } from "@/components/dashboard/helpers";

const CANCEL_THRESHOLD_DAYS = 14;

export interface OpeningItem {
    id: string;
    campgroundId: string;
    campgroundName: string;
    siteId: string;
    siteName?: string;
    from: string;
    to: string;
    nights: number;
    recGovId?: string;
    detectedAt: string;
    isSnoozed: boolean;
}

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

function OpeningCard({ item, isMobile, onSnooze, nowMs }: {
    item: OpeningItem;
    isMobile: boolean;
    onSnooze: (id: string) => void;
    nowMs: number;
}) {
    const recGovUrl = item.recGovId
        ? `https://www.recreation.gov/camping/campgrounds/${item.recGovId}`
        : "https://www.recreation.gov";

    const snoozedUntil = readStorage<Record<string, string>>("campwatch:snoozed-openings", {});
    const isSnoozedNow = item.id in snoozedUntil;

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
            <button
                onClick={() => onSnooze(item.id)}
                style={{
                    font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                    background: isSnoozedNow ? CW.mustard : "transparent",
                    color: isSnoozedNow ? CW.ink : CW.inkSubtle,
                    border: `1px solid ${isSnoozedNow ? "transparent" : CW.rule}`,
                    padding: "7px 9px", cursor: "pointer", borderRadius: 2,
                    display: "inline-flex", alignItems: "center", gap: 5,
                }}
            >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" />
                </svg>
                {isSnoozedNow
                    ? formatSnoozeLabel(snoozedUntil[item.id])
                    : "Snooze 1 month"}
            </button>
        </article>
    );
}

interface OpeningsFeedProps {
    openingItems: OpeningItem[];
    isMobile: boolean;
    nowMs: number;
    onSnooze: (id: string) => void;
    PAD: number;
}

export function OpeningsFeed({ openingItems, isMobile, nowMs, onSnooze, PAD }: OpeningsFeedProps) {
    return (
        <section style={{ padding: isMobile ? `28px 0 12px` : `40px ${PAD}px 28px` }}>
            <div style={{ padding: isMobile ? `0 ${PAD}px` : 0, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 8, textTransform: "uppercase" }}>
                            § I — STILL BOOKABLE
                        </div>
                        <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                            <span style={{ font: `900 ${isMobile ? 22 : 32}px/1 ${FH}`, textTransform: "uppercase", display: "inline" }}>OPEN RIGHT NOW</span>
                            <span style={{ font: `500 italic ${isMobile ? 22 : 32}px/1 ${FI}`, color: CW.forest, marginLeft: 12, letterSpacing: "-0.01em" }}>
                                across your watchlist.
                            </span>
                        </h2>
                    </div>
                </div>
            </div>

            {openingItems.length === 0 ? (
                <div style={{ padding: isMobile ? `0 ${PAD}px` : 0, font: `400 italic 16px/1.5 ${FI}`, color: CW.inkSubtle }}>
                    No new openings today. We&apos;re still watching.
                </div>
            ) : isMobile ? (
                <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: `4px ${PAD}px 16px`, scrollSnapType: "x mandatory" }}>
                    {openingItems.map((item) => (
                        <OpeningCard key={item.id} item={item} isMobile nowMs={nowMs} onSnooze={onSnooze} />
                    ))}
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(openingItems.length, 4)}, 1fr)`, gap: 18 }}>
                    {openingItems.map((item) => (
                        <OpeningCard key={item.id} item={item} isMobile={false} nowMs={nowMs} onSnooze={onSnooze} />
                    ))}
                </div>
            )}
        </section>
    );
}
