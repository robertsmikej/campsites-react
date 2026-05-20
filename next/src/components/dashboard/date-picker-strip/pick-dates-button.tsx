"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";

interface PickDatesButtonProps {
    isMobile: boolean;
}

export function PickDatesButton({ isMobile }: PickDatesButtonProps) {
    return (
        <button style={{
            font: `700 ${isMobile ? 10 : 11}px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
            background: "transparent", color: CW.ink, border: `1px solid ${CW.rule}`,
            padding: isMobile ? "8px 10px" : "9px 12px", cursor: "pointer", borderRadius: 2,
            display: "inline-flex", alignItems: "center", gap: 8,
        }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="1.5" y="3" width="11" height="10" rx="1" />
                <path d="M1.5 6 H12.5" />
                <path d="M4 1.5 V4 M10 1.5 V4" />
            </svg>
            Pick dates →
        </button>
    );
}
