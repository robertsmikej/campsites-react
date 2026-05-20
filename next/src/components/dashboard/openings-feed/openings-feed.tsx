"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FM } from "@/components/field-notes/tokens";
import { OpeningCard } from "./opening-card";
import { FeedEmpty } from "./feed-empty";

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
                <FeedEmpty PAD={PAD} isMobile={isMobile} />
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
