"use client";

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
}

interface OpeningsFeedProps {
    openingItems: OpeningItem[];
    isMobile: boolean;
    nowMs: number;
    PAD: number;
}

export function OpeningsFeed({ openingItems, isMobile, nowMs, PAD }: OpeningsFeedProps) {
    return (
        <section style={{ padding: isMobile ? `16px ${PAD}px 10px` : `20px ${PAD}px 16px` }}>
            <div style={{ padding: 0 }} className="mb-3 flex items-baseline gap-3 flex-wrap">
                <div className="font-mono-field text-[13px] font-bold leading-none tracking-[0.18em] text-cw-clay uppercase">
                    Open right now
                </div>
                <span className="font-italic-serif text-[14px] italic leading-none text-cw-ink-soft">
                    across your watchlist
                </span>
                {openingItems.length > 0 && (
                    <span className="ml-auto font-mono-field text-[12px] font-medium leading-none tracking-[0.12em] text-cw-ink-subtle uppercase">
                        {openingItems.length} {openingItems.length === 1 ? "opening" : "openings"}
                    </span>
                )}
            </div>

            {openingItems.length === 0 ? (
                <FeedEmpty />
            ) : isMobile ? (
                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        overflowX: "auto",
                        // Section provides the left/right inset; only vertical padding here
                        // so the scroller's start padding can't be dropped on mobile.
                        padding: `2px 0 10px`,
                        scrollSnapType: "x mandatory",
                    }}
                >
                    {openingItems.map((item) => (
                        <OpeningCard key={item.id} item={item} isMobile nowMs={nowMs} />
                    ))}
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.min(openingItems.length, 4)}, 1fr)`,
                        gap: 12,
                    }}
                >
                    {openingItems.map((item) => (
                        <OpeningCard key={item.id} item={item} isMobile={false} nowMs={nowMs} />
                    ))}
                </div>
            )}
        </section>
    );
}
