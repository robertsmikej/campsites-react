"use client";

import React from "react";
import { C, FI, FB, FM } from "@/components/field-notes/tokens";

interface FaqItemProps {
    q: string;
    a: React.ReactNode;
    index: number;
    isMobile: boolean;
}

export function FaqItem({ q, a, index, isMobile }: FaqItemProps) {
    if (isMobile) {
        return (
            <details
                className="cw-faq"
                style={{
                    padding: "14px 0",
                    borderTop: index === 0 ? "1px solid rgba(239,230,210,0.18)" : "none",
                    borderBottom: "1px solid rgba(239,230,210,0.18)",
                }}
            >
                <summary
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 14,
                        cursor: "pointer",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ font: `500 10px/1.6 ${FM}`, color: C.mustard, letterSpacing: "0.12em", flexShrink: 0 }}>Q.0{index + 1}</span>
                        <h3 style={{ font: `500 italic 19px/1.3 ${FI}`, color: C.cream, margin: 0, letterSpacing: "-0.005em" }}>{q}</h3>
                    </div>
                    <span style={{ font: `500 20px/1 ${FM}`, color: C.mustard, flexShrink: 0 }}>+</span>
                </summary>
                <p style={{ font: `400 14px/1.55 ${FB}`, color: "rgba(239,230,210,0.82)", margin: "12px 0 0 26px" }}>{a}</p>
            </details>
        );
    }

    return (
        <div
            style={{
                padding: "18px 0",
                borderTop: index === 0 ? "1px solid rgba(239,230,210,0.2)" : "none",
                borderBottom: "1px solid rgba(239,230,210,0.2)",
            }}
        >
            <div style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 16 }}>
                <span
                    style={{
                        font: `500 11px/1 ${FM}`,
                        color: C.mustard,
                        letterSpacing: "0.12em",
                        paddingTop: 6,
                    }}
                >
                    Q.0{index + 1}
                </span>
                <div>
                    <h3 style={{ margin: "0 0 10px", letterSpacing: "-0.005em" }}>
                        <span style={{ font: `500 italic 24px/1.2 ${FI}`, color: C.cream }}>
                            {q}
                        </span>
                    </h3>
                    <p
                        style={{
                            font: `400 15px/1.55 ${FB}`,
                            color: "rgba(239,230,210,0.82)",
                            margin: 0,
                            maxWidth: 640,
                        }}
                    >
                        {a}
                    </p>
                </div>
            </div>
        </div>
    );
}
