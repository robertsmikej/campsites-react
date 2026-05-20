"use client";

import { FH, FI, FM } from "@/components/field-notes/tokens";

interface StatTileProps {
    label: string;
    value: string;
    color: string;
    sub: string;
    isMobile: boolean;
}

export function StatTile({ label, value, color, sub, isMobile }: StatTileProps) {
    return (
        <div>
            <div
                style={{
                    font: `500 11px/1 ${FM}`,
                    letterSpacing: "0.16em",
                    color: "rgba(251,246,234,0.55)",
                    textTransform: "uppercase",
                }}
            >
                {label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                <span
                    style={{
                        font: `900 ${isMobile ? 32 : 36}px/1 ${FH}`,
                        color,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {value}
                </span>
                <span style={{ font: `500 italic 14px/1 ${FI}`, color: "rgba(251,246,234,0.55)" }}>
                    {sub}
                </span>
            </div>
        </div>
    );
}
