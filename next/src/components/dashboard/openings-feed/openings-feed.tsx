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
        <section style={{ padding: isMobile ? `28px 0 12px` : `40px ${PAD}px 28px` }}>
            <div style={{ padding: isMobile ? `0 ${PAD}px` : 0 }} className="mb-5">
                <div className="flex items-baseline justify-between">
                    <div>
                        <div className="font-mono-field text-[13px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-2 uppercase">
                            § I — STILL BOOKABLE
                        </div>
                        <h2 className="m-0 tracking-[-0.005em]">
                            <span
                                className="font-poster font-black leading-none uppercase inline"
                                style={{ fontSize: isMobile ? 22 : 32 }}
                            >
                                OPEN RIGHT NOW
                            </span>
                            <span
                                className="font-italic-serif font-medium italic leading-none text-cw-forest tracking-[-0.01em]"
                                style={{ fontSize: isMobile ? 22 : 32, marginLeft: 12 }}
                            >
                                across your watchlist.
                            </span>
                        </h2>
                    </div>
                </div>
            </div>

            {openingItems.length === 0 ? (
                <FeedEmpty />
            ) : isMobile ? (
                <div
                    style={{
                        display: "flex",
                        gap: 12,
                        overflowX: "auto",
                        padding: `4px ${PAD}px 16px`,
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
                        gap: 18,
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
