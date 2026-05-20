"use client";

import { C, FH, FI } from "@/components/field-notes/tokens";

interface WordmarkProps {
    isMobile: boolean;
}

export function Wordmark({ isMobile }: WordmarkProps) {
    return (
        <div>
            <div
                style={{
                    font: `900 ${isMobile ? 48 : 72}px/0.9 ${FH}`,
                    color: C.cream,
                    textTransform: "uppercase",
                    letterSpacing: "0.005em",
                }}
            >
                CAMPWATCH
            </div>
            <div
                style={{
                    font: `400 italic 17px/1.4 ${FI}`,
                    color: "rgba(251,246,234,0.65)",
                    marginTop: 10,
                }}
            >
                Built by a camper, for campers. Polling quietly since 2026.
            </div>
        </div>
    );
}
