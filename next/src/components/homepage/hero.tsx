"use client";

import React from "react";
import { C, FH, FI, FB, FM, FN, PAD_M } from "@/components/field-notes/tokens";
import { DScene, DCompass, DPostmark } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";
import type { AuthState } from "@/hooks/use-auth";

// ─── Stat formatters (used in pinned bulletin card) ───────────────────────────
function formatTimeAgo(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

interface HeroProps {
    auth: AuthState;
}

export function Hero({ auth }: HeroProps) {
    const isMobile = useIsMobile();
    const { stats, nowMs } = useStats();

    const navLinkStyle: React.CSSProperties = {
        color: "inherit",
        textDecoration: "none",
    };

    const navAvatarStyle: React.CSSProperties = {
        width: 28,
        height: 28,
        borderRadius: 14,
        background: C.clay,
        color: C.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `700 11px ${FM}`,
    };

    return (
        <section style={{ position: "relative", minHeight: isMobile ? 760 : 980, overflow: "hidden" }}>
            <DScene />
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 30%, rgba(20,15,12,0.35) 95%)",
                    pointerEvents: "none",
                }}
            />

            {/* NAV */}
            <div
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: isMobile ? `14px ${PAD_M}px` : "24px 56px",
                    zIndex: 3,
                }}
            >
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
                <nav
                    style={{
                        display: "flex",
                        gap: 28,
                        alignItems: "center",
                        font: `600 12px/1 ${FM}`,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: C.cream,
                    }}
                >
                    {!isMobile && (
                        <>
                            <a href={auth.user ? "/app" : "/discover"} style={navLinkStyle}>
                                Dashboard
                            </a>
                            <a href="#faq" style={{ ...navLinkStyle, opacity: 0.75 }}>
                                Field Notes
                            </a>
                            <span style={{ width: 1, height: 14, background: "rgba(251,246,234,0.3)" }} />
                        </>
                    )}
                    {auth.isLoading ? null : auth.user ? (
                        <a href="/app/account" aria-label="Account" style={{ textDecoration: "none" }}>
                            <div style={navAvatarStyle}>{auth.user.name?.[0]?.toUpperCase() ?? "?"}</div>
                        </a>
                    ) : (
                        <a
                            href="/auth/google/start?returnTo=/app"
                            style={{
                                ...navLinkStyle,
                                border: "1px solid rgba(251,246,234,0.6)",
                                padding: "6px 10px",
                                borderRadius: 2,
                            }}
                        >
                            Sign in
                        </a>
                    )}
                </nav>
            </div>

            {/* Hero content */}
            <div
                style={{
                    position: isMobile ? "relative" : "absolute",
                    inset: isMobile ? undefined : 0,
                    padding: isMobile ? `40px ${PAD_M}px 36px` : "0 56px",
                    zIndex: 2,
                    display: isMobile ? "block" : "grid",
                    gridTemplateColumns: isMobile ? undefined : "1fr 360px",
                    gap: isMobile ? undefined : 56,
                    alignItems: isMobile ? undefined : "center",
                }}
            >
                <div>
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
                    <p
                        style={{
                            font: `400 ${isMobile ? 15.5 : 18}px/1.55 ${FB}`,
                            color: "rgba(251,246,234,0.92)",
                            maxWidth: isMobile ? undefined : 540,
                            margin: isMobile ? "0 0 22px" : "0 0 32px",
                        }}
                    >
                        Recreation.gov sells out in minutes. CampWatch watches the sites you actually want, every five
                        minutes, and emails you the second one opens. No app, no notifications to babysit.
                    </p>
                    <div style={isMobile ? { display: "grid", gap: 10 } : { display: "flex", gap: 14, alignItems: "center" }}>
                        {auth.isLoading ? (
                            <>
                                <div
                                    style={{
                                        width: isMobile ? undefined : 200,
                                        height: 48,
                                        background: "rgba(251,246,234,0.15)",
                                        borderRadius: 2,
                                    }}
                                />
                                <div
                                    style={{
                                        width: isMobile ? undefined : 160,
                                        height: 48,
                                        background: "rgba(251,246,234,0.08)",
                                        borderRadius: 2,
                                        border: "1.5px solid rgba(251,246,234,0.3)",
                                    }}
                                />
                            </>
                        ) : (
                            <>
                                <a
                                    href={auth.user ? "/app" : "/auth/google/start?returnTo=/app"}
                                    style={{
                                        font: `800 13px/1 ${FH}`,
                                        letterSpacing: "0.14em",
                                        textTransform: "uppercase",
                                        background: C.cream,
                                        color: C.ink,
                                        padding: "16px 22px",
                                        textDecoration: "none",
                                        display: isMobile ? "flex" : "inline-flex",
                                        alignItems: "center",
                                        justifyContent: isMobile ? "center" : undefined,
                                        width: isMobile ? "100%" : undefined,
                                        gap: 10,
                                        borderRadius: 2,
                                        boxSizing: isMobile ? "border-box" : undefined,
                                    }}
                                >
                                    {auth.user ? "Open the Dashboard" : "Sign in with Google"}
                                    <svg width="14" height="14" viewBox="0 0 14 14">
                                        <path
                                            d="M1 7 L13 7 M8 2 L13 7 L8 12"
                                            stroke={C.ink}
                                            strokeWidth="1.8"
                                            fill="none"
                                        />
                                    </svg>
                                </a>
                                {isMobile && (
                                    <a
                                        href="/discover"
                                        style={{
                                            font: `800 13px/1 ${FH}`,
                                            letterSpacing: "0.14em",
                                            textTransform: "uppercase",
                                            color: C.cream,
                                            padding: "16px 20px",
                                            textDecoration: "none",
                                            border: "1.5px solid rgba(251,246,234,0.6)",
                                            borderRadius: 2,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        Browse the Picks
                                    </a>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Pinned bulletin card — desktop only */}
                {!isMobile && <div style={{ position: "relative" }}>
                    <div
                        style={{
                            background: C.cream,
                            padding: 20,
                            border: `1.5px solid ${C.ink}`,
                            transform: "rotate(1.6deg)",
                            boxShadow: `8px 8px 0 ${C.forest}, 0 30px 60px -20px rgba(0,0,0,0.4)`,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 10,
                            }}
                        >
                            <div>
                                <div style={{ font: `500 10px/1 ${FM}`, letterSpacing: "0.18em", color: C.clay }}>
                                    FIELD STATION
                                </div>
                                <div style={{ font: `900 24px/1 ${FH}`, marginTop: 6, textTransform: "uppercase" }}>
                                    Sawtooth NRA
                                </div>
                                <div
                                    style={{
                                        font: `500 italic 14px/1.3 ${FI}`,
                                        marginTop: 4,
                                        color: C.inkSoft,
                                    }}
                                >
                                    Stanley · Custer Co., Idaho
                                </div>
                            </div>
                            <DCompass size={44} color={C.forest} />
                        </div>
                        <div style={{ margin: "12px 0", height: 1, background: C.rule }} />
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                rowGap: 8,
                                font: `500 10px/1 ${FM}`,
                                letterSpacing: "0.14em",
                                color: C.inkSoft,
                            }}
                        >
                            <span>ELEV</span>
                            <span style={{ textAlign: "right", color: C.ink }}>6,512 FT</span>
                            <span>SITES</span>
                            <span style={{ textAlign: "right", color: C.ink }}>38</span>
                            <span>OPEN</span>
                            <span style={{ textAlign: "right", color: C.forest, font: `900 14px ${FH}` }}>
                                3 NIGHTS
                            </span>
                            <span>LAST POLL</span>
                            <span style={{ textAlign: "right", color: C.clay }}>
                                {stats ? formatTimeAgo(nowMs - new Date(stats.lastPollAt).getTime()) : "—"}
                            </span>
                        </div>
                        <div style={{ margin: "12px 0 6px", height: 1, background: C.ruleSoft }} />
                        <div style={{ font: `600 italic 14px/1.4 ${FN}`, color: C.clay }}>
                            a quiet, perfect spot — N.L.
                        </div>
                    </div>
                    <div style={{ position: "absolute", bottom: -28, left: -34, transform: "rotate(-14deg)" }}>
                        <DPostmark />
                    </div>
                </div>}
            </div>

            {/* Hero attribution */}
        </section>
    );
}
