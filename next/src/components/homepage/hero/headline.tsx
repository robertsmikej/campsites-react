"use client";

import { C, FH, FI } from "@/components/field-notes/tokens";

interface HeadlineProps {
    isMobile: boolean;
}

export function Headline({ isMobile }: HeadlineProps) {
    return (
        <h1 style={{ margin: isMobile ? "0 0 18px" : "0 0 26px", color: C.cream, textShadow: "0 1px 30px rgba(0,0,0,0.25)" }}>
            <span
                style={{
                    font: `900 ${isMobile ? 58 : 124}px/0.86 ${FH}`,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    display: "block",
                }}
            >
                NEVER MISS
            </span>
            <span
                style={{
                    font: `900 ${isMobile ? 58 : 124}px/0.86 ${FH}`,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    display: "block",
                }}
            >
                A <span style={{ color: "#f6c79c" }}>CAMPSITE,</span>
            </span>
            <span
                style={{
                    font: `500 italic ${isMobile ? 38 : 88}px/1 ${FI}`,
                    letterSpacing: "-0.015em",
                    display: "block",
                    marginTop: 4,
                }}
            >
                by the lake or otherwise.
            </span>
        </h1>
    );
}
