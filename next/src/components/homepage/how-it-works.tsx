"use client";

import React from "react";
import { C, FH, FI, FB, FM, PAD_M } from "@/components/field-notes/tokens";
import { DTopo } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function HowItWorks() {
    const isMobile = useIsMobile();

    return (
        <section
            style={{
                padding: isMobile ? `60px ${PAD_M}px` : "88px 56px",
                background: C.cream,
                borderTop: `1.5px solid ${C.ink}`,
                borderBottom: `1.5px solid ${C.ink}`,
                position: "relative",
            }}
        >
            <DTopo opacity={0.06} />
            <div
                style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "260px 1fr",
                    gap: isMobile ? 28 : 64,
                    alignItems: "flex-start",
                }}
            >
                <div>
                    <div
                        style={{
                            font: `500 11px/1 ${FM}`,
                            letterSpacing: "0.18em",
                            color: C.clay,
                            marginBottom: 10,
                        }}
                    >
                        METHOD
                    </div>
                    <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                        <span
                            style={{
                                font: `900 ${isMobile ? 44 : 56}px/0.95 ${FH}`,
                                textTransform: "uppercase",
                                display: "block",
                            }}
                        >
                            THREE SMALL THINGS,
                        </span>
                        <span
                            style={{
                                font: `500 italic ${isMobile ? 34 : 44}px/1 ${FI}`,
                                color: C.forest,
                                display: "block",
                                marginTop: 4,
                                letterSpacing: "-0.01em",
                            }}
                        >
                            then a quiet inbox.
                        </span>
                    </h2>
                    <p
                        style={{
                            font: `400 italic 15px/1.5 ${FI}`,
                            color: C.inkSoft,
                            marginTop: 20,
                            maxWidth: isMobile ? undefined : 240,
                        }}
                    >
                        Set it up once, in about a minute. Ignore us forever until summer.
                    </p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 28 }}>
                    {(
                        [
                            {
                                rn: "i.",
                                num: "01",
                                t: "Choose the places",
                                d: "Paste any recreation.gov campground ID — or pick from our hand-curated site list. No limit; watch as many as you like.",
                                ic: "pin",
                            },
                            {
                                rn: "ii.",
                                num: "02",
                                t: "Tell us your window",
                                d: "Date ranges, minimum nights, weekday vs weekend. We only bother you about openings that actually fit.",
                                ic: "cal",
                            },
                            {
                                rn: "iii.",
                                num: "03",
                                t: "Wait for mail",
                                d: "A short, plain email — site, dates, link to book. Only when your sites come open. One-click unsubscribe whenever you've had enough.",
                                ic: "mail",
                            },
                        ] as const
                    ).map((step) => (
                        <div key={step.num} style={{ borderTop: `2px solid ${C.ink}`, paddingTop: 18 }}>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    marginBottom: 14,
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                                    <span style={{ font: `900 38px/1 ${FH}`, color: C.forest }}>{step.num}</span>
                                    <span style={{ font: `500 italic 28px/1 ${FI}`, color: C.clay }}>{step.rn}</span>
                                </div>
                                <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 32 32"
                                    stroke={C.ink}
                                    strokeWidth="1.6"
                                    fill="none"
                                >
                                    {step.ic === "pin" && (
                                        <>
                                            <path d="M16 5 C11 5 7 9 7 14 C7 21 16 28 16 28 C16 28 25 21 25 14 C25 9 21 5 16 5 Z" />
                                            <circle cx="16" cy="14" r="3.5" />
                                        </>
                                    )}
                                    {step.ic === "cal" && (
                                        <>
                                            <rect x="5" y="7" width="22" height="20" rx="1" />
                                            <line x1="5" y1="12" x2="27" y2="12" />
                                            <line x1="10" y1="4" x2="10" y2="10" />
                                            <line x1="22" y1="4" x2="22" y2="10" />
                                        </>
                                    )}
                                    {step.ic === "mail" && (
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
                                {step.t}
                            </h3>
                            <p style={{ font: `400 14px/1.55 ${FB}`, color: C.inkSoft, margin: 0 }}>{step.d}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
