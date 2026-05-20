"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FI } from "@/components/field-notes/tokens";

interface FeedEmptyProps {
    PAD: number;
    isMobile: boolean;
}

export function FeedEmpty({ PAD, isMobile }: FeedEmptyProps) {
    return (
        <div style={{ padding: isMobile ? `0 ${PAD}px` : 0, font: `400 italic 16px/1.5 ${FI}`, color: CW.inkSubtle }}>
            No new openings today. We&apos;re still watching.
        </div>
    );
}
