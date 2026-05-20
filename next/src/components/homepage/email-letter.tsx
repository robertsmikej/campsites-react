"use client";

import React from "react";
import { C, FH, FI, FB, FM, FN, PAD_M } from "@/components/field-notes/tokens";
import { DBadge } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { AuthState } from "@/hooks/use-auth";

interface EmailLetterProps {
    auth: AuthState;
}

export function EmailLetter({ auth }: EmailLetterProps) {
    const isMobile = useIsMobile();

    return (
        <section style={{ padding: isMobile ? `60px ${PAD_M}px` : "96px 56px 80px", position: "relative" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 28 : 72, alignItems: "center" }}>
                <div>
                    <div
                        style={{
                            font: `500 11px/1 ${FM}`,
                            letterSpacing: "0.18em",
                            color: C.clay,
                            marginBottom: 10,
                        }}
                    >
                        DISPATCH
                    </div>
                    <h2 style={{ margin: "0 0 24px", letterSpacing: "-0.005em" }}>
                        <span
                            style={{
                                font: `900 ${isMobile ? 44 : 56}px/0.95 ${FH}`,
                                textTransform: "uppercase",
                                display: "block",
                            }}
                        >
                            THE WHOLE PRODUCT
                        </span>
                        <span
                            style={{
                                font: `500 italic ${isMobile ? 38 : 56}px/1 ${FI}`,
                                color: C.forest,
                                display: "block",
                                marginTop: 4,
                                letterSpacing: "-0.01em",
                            }}
                        >
                            fits in an email.
                        </span>
                    </h2>
                    <p
                        style={{
                            font: `400 17px/1.6 ${FB}`,
                            color: C.inkSoft,
                            maxWidth: 460,
                            margin: "0 0 24px",
                        }}
                    >
                        No app to open. No notifications to manage. One short, well-written note when a site
                        you&apos;d actually take opens up — direct link, two-sentence body, one-click unsubscribe.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <DBadge color={C.forest}>Direct Booking Link</DBadge>
                        <DBadge color={C.forest}>One-click Unsubscribe</DBadge>
                        <DBadge color={C.forest}>Plain Text · No Tracking</DBadge>
                    </div>
                    <div
                        style={{
                            font: `600 italic 22px/1.3 ${FN}`,
                            color: C.clay,
                            marginTop: 28,
                        }}
                    >
                        &ldquo;faster than your refresh tab.&rdquo;
                    </div>
                </div>

                {/* The letter, tilted on desktop */}
                <div style={{ position: "relative" }}>
                    <div
                        style={{
                            background: C.cream,
                            padding: isMobile ? "20px 18px" : "28px 32px",
                            border: `1.5px solid ${C.ink}`,
                            boxShadow: isMobile ? `6px 6px 0 ${C.forest}` : `10px 10px 0 ${C.forest}`,
                            transform: isMobile ? undefined : "rotate(1.8deg)",
                            position: "relative",
                        }}
                    >
                        {/* Washi tape */}
                        <div
                            style={{
                                position: "absolute",
                                top: -10,
                                left: "50%",
                                transform: "translateX(-50%) rotate(-3deg)",
                                width: 110,
                                height: 22,
                                background: "rgba(201,162,39,0.35)",
                                border: "1px solid rgba(201,162,39,0.55)",
                            }}
                        />

                        {/* Envelope-style header */}
                        <div
                            style={{
                                borderBottom: `1px solid ${C.rule}`,
                                paddingBottom: 14,
                                marginBottom: 16,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                            }}
                        >
                            <div
                                style={{
                                    font: `500 11px/1.6 ${FM}`,
                                    color: C.inkSoft,
                                    letterSpacing: "0.06em",
                                }}
                            >
                                <div style={{ color: C.inkSoft }}>FROM</div>
                                <div style={{ color: C.ink, marginTop: 2 }}>
                                    CampWatch &lt;alerts@campwatch.app&gt;
                                </div>
                                <div style={{ color: C.inkSoft, marginTop: 8 }}>TO</div>
                                <div style={{ color: C.ink, marginTop: 2 }}>{auth.user?.email ?? "you@trail.example"}</div>
                            </div>
                            <div
                                style={{
                                    font: `500 10px/1.5 ${FM}`,
                                    color: C.inkSoft,
                                    letterSpacing: "0.1em",
                                    textAlign: "right",
                                }}
                            >
                                <div>05.20.MMXXVI</div>
                                <div>07:14 MDT</div>
                            </div>
                        </div>

                        <div
                            style={{
                                font: `900 26px/1.1 ${FH}`,
                                textTransform: "uppercase",
                                marginBottom: 4,
                            }}
                        >
                            <span style={{ color: C.clay }}>2 OPENINGS</span> — OUTLET, PINE FLATS
                        </div>
                        <p
                            style={{
                                font: `500 italic 18px/1.4 ${FI}`,
                                color: C.inkSoft,
                                margin: "0 0 16px",
                            }}
                        >
                            Hello — two new openings this morning. Both match your window.
                        </p>

                        {(
                            [
                                {
                                    name: "Outlet Campground · Site 015",
                                    date: "Fri – Sun, May 23 – 25 · 2 nights",
                                    tag: "NEW",
                                },
                                {
                                    name: "Pine Flats · Site 008",
                                    date: "Sat, Jun 6 · 1 night",
                                    tag: "CANCEL",
                                },
                            ] as const
                        ).map((e) => (
                            <div key={e.name} style={{ padding: "12px 0", borderTop: `1px dashed ${C.rule}` }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "baseline",
                                    }}
                                >
                                    <div style={{ font: `600 16px/1.2 ${FB}` }}>{e.name}</div>
                                    <span
                                        style={{
                                            font: `700 9px/1 ${FM}`,
                                            letterSpacing: "0.16em",
                                            color: C.clay,
                                            border: `1px solid ${C.clay}`,
                                            padding: "3px 6px",
                                        }}
                                    >
                                        {e.tag}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        font: `500 italic 14px/1.4 ${FI}`,
                                        color: C.inkSoft,
                                        marginTop: 4,
                                    }}
                                >
                                    {e.date}
                                </div>
                                <a
                                    style={{
                                        font: `600 13px/1 ${FB}`,
                                        color: C.forest,
                                        textDecoration: "underline",
                                        marginTop: 6,
                                        display: "inline-block",
                                    }}
                                >
                                    Book on recreation.gov →
                                </a>
                            </div>
                        ))}
                        <div
                            style={{
                                borderTop: `1px dashed ${C.rule}`,
                                marginTop: 8,
                                paddingTop: 14,
                                font: `400 italic 14px/1.5 ${FI}`,
                                color: C.inkSoft,
                            }}
                        >
                            Yours from the trail,
                            <br />
                            <span style={{ font: `600 22px/1 ${FN}`, color: C.clay }}>— CampWatch</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
