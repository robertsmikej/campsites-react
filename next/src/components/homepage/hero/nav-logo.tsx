"use client";

import { C, FH } from "@/components/field-notes/tokens";

export function NavLogo() {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg viewBox="0 0 32 32" width="28" height="28">
                <path d="M16 4 L4 28 L28 28 Z" fill="none" stroke={C.cream} strokeWidth="2" />
                <path d="M16 12 L10 28 L22 28 Z" fill={C.cream} />
            </svg>
            <span
                style={{
                    font: `900 19px/1 ${FH}`,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: C.cream,
                }}
            >
                CampWatch
            </span>
        </div>
    );
}
