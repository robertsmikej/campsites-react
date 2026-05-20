"use client";

import { C, FH, FI, FB, FM } from "@/components/field-notes/tokens";

type StepIcon = "pin" | "cal" | "mail";

interface StepColumnProps {
    rn: string;
    num: string;
    t: string;
    d: string;
    ic: StepIcon;
}

export function StepColumn({ rn, num, t, d, ic }: StepColumnProps) {
    return (
        <div style={{ borderTop: `2px solid ${C.ink}`, paddingTop: 18 }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 14,
                }}
            >
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{ font: `900 38px/1 ${FH}`, color: C.forest }}>{num}</span>
                    <span style={{ font: `500 italic 28px/1 ${FI}`, color: C.clay }}>{rn}</span>
                </div>
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    stroke={C.ink}
                    strokeWidth="1.6"
                    fill="none"
                >
                    {ic === "pin" && (
                        <>
                            <path d="M16 5 C11 5 7 9 7 14 C7 21 16 28 16 28 C16 28 25 21 25 14 C25 9 21 5 16 5 Z" />
                            <circle cx="16" cy="14" r="3.5" />
                        </>
                    )}
                    {ic === "cal" && (
                        <>
                            <rect x="5" y="7" width="22" height="20" rx="1" />
                            <line x1="5" y1="12" x2="27" y2="12" />
                            <line x1="10" y1="4" x2="10" y2="10" />
                            <line x1="22" y1="4" x2="22" y2="10" />
                        </>
                    )}
                    {ic === "mail" && (
                        <>
                            <rect x="4" y="7" width="24" height="18" rx="1" />
                            <path d="M4 8 L16 18 L28 8" />
                        </>
                    )}
                </svg>
            </div>
            <h3
                style={{
                    margin: "0 0 10px",
                    font: `900 22px/1.15 ${FH}`,
                    textTransform: "uppercase",
                }}
            >
                {t}
            </h3>
            <p style={{ font: `400 14px/1.55 ${FB}`, color: C.inkSoft, margin: 0 }}>{d}</p>
        </div>
    );
}
