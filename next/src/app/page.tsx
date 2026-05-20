"use client";

import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";

// ─── Color palette ───────────────────────────────────────────────────────────
const C = {
    paper: "#F4EAD8",
    cream: "#FBF6EA",
    ink: "#1A1614",
    inkSoft: "rgba(26,22,20,0.7)",
    rule: "rgba(26,22,20,0.18)",
    ruleSoft: "rgba(26,22,20,0.08)",
    forest: "#1F3D2A",
    forestDeep: "#142a1d",
    clay: "#B65C3F",
    mustard: "#C9A227",
    skyMid: "#e89b8a",
    skyLow: "#b97a8d",
    water: "#3d5b6e",
    waterDeep: "#243747",
    mountainShadow: "#3a2e38",
    forestNear: "#1a221c",
    fire: "#ef7a3e",
};

// ─── Font helpers (CSS variables loaded via next/font/google in layout.tsx) ──
const FH = "var(--font-poster), 'Anton', sans-serif";
const FI = "var(--font-italic-serif), 'Cormorant', Georgia, serif";
const FB = "var(--font-body-serif), 'Source Serif Pro', Georgia, serif";
const FM = "var(--font-mono-field), 'JetBrains Mono', ui-monospace, monospace";
const FN = "var(--font-hand), 'Kalam', cursive";

// ─── Topographic contour lines ───────────────────────────────────────────────
function DTopo({ opacity = 0.08, stroke = C.forest }: { opacity?: number; stroke?: string }) {
    const lines: React.ReactNode[] = [];
    const peaks = [
        { cx: 220, cy: 360, base: 40, step: 26, count: 9, jitter: 0.12 },
        { cx: 880, cy: 180, base: 60, step: 30, count: 7, jitter: 0.18 },
    ];
    peaks.forEach((p, pi) => {
        for (let i = 0; i < p.count; i++) {
            const r = p.base + i * p.step;
            const pts: [number, number][] = [];
            const segs = 36;
            for (let s = 0; s < segs; s++) {
                const a = (s / segs) * Math.PI * 2;
                const wob =
                    1 +
                    Math.sin(a * 3 + pi * 1.7 + i * 0.6) * p.jitter * 0.5 +
                    Math.cos(a * 2 + pi * 2.1 + i * 0.3) * p.jitter * 0.3;
                pts.push([p.cx + Math.cos(a) * r * wob, p.cy + Math.sin(a) * r * 0.78 * wob]);
            }
            const d =
                pts.map((pt, idx) => (idx ? "L" : "M") + pt[0].toFixed(1) + "," + pt[1].toFixed(1)).join(" ") + "Z";
            lines.push(
                <path
                    key={pi + "-" + i}
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={i % 5 === 0 ? 1.1 : 0.6}
                    opacity={i % 5 === 0 ? 0.85 : 0.55}
                />,
            );
        }
    });
    return (
        <svg
            viewBox="0 0 1200 600"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity, pointerEvents: "none" }}
        >
            {lines}
        </svg>
    );
}

// ─── Dusk lake scene ─────────────────────────────────────────────────────────
function DScene() {
    return (
        <svg
            viewBox="0 0 1600 900"
            preserveAspectRatio="xMidYMid slice"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        >
            <defs>
                <linearGradient id="d-sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f6c79c" />
                    <stop offset="50%" stopColor={C.skyMid} />
                    <stop offset="100%" stopColor={C.skyLow} />
                </linearGradient>
                <linearGradient id="d-water" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.water} />
                    <stop offset="100%" stopColor={C.waterDeep} />
                </linearGradient>
                <radialGradient id="d-sun" cx="0.78" cy="0.55" r="0.12">
                    <stop offset="0%" stopColor="#fff3d8" stopOpacity="0.95" />
                    <stop offset="60%" stopColor="#f6c79c" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f6c79c" stopOpacity="0" />
                </radialGradient>
                <filter id="d-noise">
                    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
                    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0" />
                </filter>
            </defs>
            <rect width="1600" height="560" fill="url(#d-sky)" />
            <rect width="1600" height="560" fill="url(#d-sun)" />
            <circle cx="1250" cy="495" r="42" fill="#fff7e0" opacity="0.96" />
            <path
                d="M 0 470 L 120 380 L 240 430 L 360 320 L 480 400 L 620 290 L 760 380 L 900 310 L 1040 400 L 1180 340 L 1320 410 L 1460 350 L 1600 420 L 1600 600 L 0 600 Z"
                fill="#5a4a55"
                opacity="0.85"
            />
            <path
                d="M 0 520 L 140 440 L 280 490 L 400 410 L 540 470 L 700 400 L 840 470 L 980 420 L 1120 480 L 1280 430 L 1420 490 L 1600 460 L 1600 620 L 0 620 Z"
                fill={C.mountainShadow}
                opacity="0.85"
            />
            <path d="M 0 540 L 1600 540 L 1600 600 L 0 600 Z" fill="#2c3a2e" opacity="0.85" />
            <rect x="0" y="560" width="1600" height="340" fill="url(#d-water)" />
            <g opacity="0.32">
                <path
                    d="M 0 560 L 120 650 L 240 600 L 360 720 L 480 640 L 620 750 L 760 660 L 900 730 L 1040 640 L 1180 700 L 1320 630 L 1460 690 L 1600 620 L 1600 580 L 0 580 Z"
                    fill={C.mountainShadow}
                />
            </g>
            <ellipse cx="1250" cy="600" rx="22" ry="3" fill="#fff7e0" opacity="0.8" />
            <ellipse cx="1250" cy="640" rx="40" ry="2" fill="#fff7e0" opacity="0.4" />
            <ellipse cx="1250" cy="680" rx="56" ry="2" fill="#fff7e0" opacity="0.25" />
            <ellipse cx="1250" cy="720" rx="72" ry="2" fill="#fff7e0" opacity="0.15" />
            {Array.from({ length: 22 }).map((_, i) => {
                const y = 590 + i * 14;
                const w = 200 + i * 30;
                const x = (i * 137) % 1400;
                return <line key={i} x1={x} y1={y} x2={x + w} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />;
            })}
            <g transform="translate(1100, 480)">
                {[0, 60, 100, 160, 220, 280, 340, 400, 460].map((x, i) => (
                    <path
                        key={i}
                        d={`M ${x} 120 L ${x + 12 + (i % 3) * 4} 50 L ${x + 24 + (i % 3) * 4} 120 Z`}
                        fill={C.forestNear}
                    />
                ))}
                <rect x="0" y="115" width="500" height="40" fill={C.forestNear} />
            </g>
            <g transform="translate(110, 540)">
                <path d="M 0 80 Q 200 70 400 80 L 400 200 L 0 200 Z" fill={C.forestNear} />
                <g transform="translate(160, 30)">
                    <path d="M 0 60 L 40 0 L 80 60 Z" fill="#d9b380" />
                    <path d="M 40 0 L 40 60" stroke="#7a5a38" strokeWidth="1.5" />
                    <path d="M 40 0 L 28 60 L 52 60 Z" fill="#7a5a38" />
                    <circle cx="92" cy="56" r="6" fill="#ffe09a" opacity="0.85" />
                    <circle cx="92" cy="56" r="12" fill="#ffe09a" opacity="0.25" />
                </g>
                <g transform="translate(80, 70)">
                    <ellipse cx="0" cy="14" rx="14" ry="3" fill="#1a221c" />
                    <path d="M -6 12 L 0 -10 L 6 12 Z" fill={C.fire} />
                    <path d="M -3 12 L 0 -2 L 3 12 Z" fill="#ffd66a" />
                </g>
                {[20, 280, 340].map((x, i) => (
                    <g key={i} transform={`translate(${x}, 0)`}>
                        <path d="M 0 40 L 10 -60 L 20 40 Z" fill={C.forestNear} />
                        <rect x="8" y="40" width="4" height="14" fill="#2a1c12" />
                    </g>
                ))}
            </g>
            <rect width="1600" height="900" filter="url(#d-noise)" opacity="0.55" />
        </svg>
    );
}

// ─── Compass rose ─────────────────────────────────────────────────────────────
function DCompass({ size = 56, color = C.cream }: { size?: number; color?: string }) {
    return (
        <svg viewBox="0 0 64 64" width={size} height={size} style={{ display: "block" }}>
            <circle cx="32" cy="32" r="29" fill="none" stroke={color} strokeWidth="1.2" opacity="0.9" />
            <circle cx="32" cy="32" r="22" fill="none" stroke={color} strokeWidth="0.6" opacity="0.5" />
            <path d="M32 6 L36 32 L32 30 L28 32 Z" fill={color} />
            <path d="M32 58 L36 32 L32 34 L28 32 Z" fill="none" stroke={color} strokeWidth="1" />
            <path d="M6 32 L32 28 L30 32 L32 36 Z" fill="none" stroke={color} strokeWidth="1" />
            <path d="M58 32 L32 28 L34 32 L32 36 Z" fill="none" stroke={color} strokeWidth="1" />
        </svg>
    );
}

// ─── Postmark ─────────────────────────────────────────────────────────────────
function DPostmark({
    size = 100,
    label = "CHECKED EVERY · V MIN",
    date = "EST · MMXXVI",
}: {
    size?: number;
    label?: string;
    date?: string;
}) {
    return (
        <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: "block" }}>
            <circle cx="60" cy="60" r="54" fill="none" stroke={C.clay} strokeWidth="1.2" opacity="0.7" />
            <circle cx="60" cy="60" r="44" fill="none" stroke={C.clay} strokeWidth="0.8" opacity="0.6" />
            <circle cx="60" cy="60" r="34" fill="none" stroke={C.clay} strokeWidth="0.6" opacity="0.5" />
            <path id="d-arc-top" d="M 60 60 m -38 0 a 38 38 0 0 1 76 0" fill="none" />
            <path id="d-arc-bot" d="M 60 60 m -38 0 a 38 38 0 0 0 76 0" fill="none" />
            <text style={{ font: `700 8px ${FM}`, fill: C.clay, letterSpacing: "0.2em" }}>
                <textPath xlinkHref="#d-arc-top" startOffset="50%" textAnchor="middle">
                    {label}
                </textPath>
            </text>
            <text style={{ font: `700 7px ${FM}`, fill: C.clay, letterSpacing: "0.18em" }}>
                <textPath xlinkHref="#d-arc-bot" startOffset="50%" textAnchor="middle">
                    {date}
                </textPath>
            </text>
            <text x="60" y="55" textAnchor="middle" style={{ font: `900 16px ${FH}`, fill: C.clay }}>
                CAMPWATCH
            </text>
            <text x="60" y="70" textAnchor="middle" style={{ font: `500 italic 11px ${FI}`, fill: C.clay }}>
                polling
            </text>
        </svg>
    );
}

// ─── Postage stamp ────────────────────────────────────────────────────────────
function DStamp() {
    return (
        <div
            style={{
                width: 80,
                height: 100,
                background:
                    `radial-gradient(circle at 4px 4px, ${C.paper} 1.5px, transparent 1.5px) 0 0 / 8px 8px, ${C.cream}`,
                border: "1px solid rgba(29,24,21,0.18)",
                padding: 4,
                position: "relative",
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    background: `linear-gradient(180deg, ${C.skyMid} 0%, ${C.skyLow} 50%, ${C.water} 51%, ${C.waterDeep} 100%)`,
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <svg viewBox="0 0 80 100" style={{ width: "100%", height: "100%", display: "block" }}>
                    <path d="M 0 55 L 20 35 L 40 50 L 60 32 L 80 48 L 80 60 L 0 60 Z" fill={C.mountainShadow} />
                    <circle cx="60" cy="38" r="4" fill="#fff7e0" />
                    <path d="M 30 78 L 36 64 L 42 78 Z" fill={C.forestNear} />
                    <text
                        x="40"
                        y="96"
                        textAnchor="middle"
                        style={{ font: `700 5px ${FM}`, fill: "#fff", letterSpacing: "0.16em" }}
                    >
                        U.S. POSTAGE · $0.00
                    </text>
                </svg>
            </div>
        </div>
    );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function DBadge({ children, color = C.clay }: { children: React.ReactNode; color?: string }) {
    return (
        <span
            style={{
                font: `700 11px/1 ${FM}`,
                letterSpacing: "0.16em",
                color,
                border: `1px solid ${color}`,
                padding: "5px 8px",
                textTransform: "uppercase",
                borderRadius: 2,
                background: "transparent",
            }}
        >
            {children}
        </span>
    );
}

// ─── Availability bars ────────────────────────────────────────────────────────
function DBars({ pattern, accent = C.forest, secondary = C.mustard }: { pattern: string; accent?: string; secondary?: string }) {
    return (
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 26 }}>
            {pattern.split("").map((ch, i) => {
                const h = ch === "." ? 5 : ch === "y" ? 16 : 22;
                const bg = ch === "." ? "rgba(26,22,20,0.15)" : ch === "y" ? secondary : accent;
                return <div key={i} style={{ width: 6, height: h, background: bg, borderRadius: 1 }} />;
            })}
        </div>
    );
}

// ─── Stats types ──────────────────────────────────────────────────────────────
interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useStats(): NotifierStats | null {
    const [stats, setStats] = useState<NotifierStats | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            fetch("/api/stats")
                .then((r) => (r.ok ? r.json() : null))
                .then((data: unknown) => {
                    if (cancelled) return;
                    setStats(data as NotifierStats | null);
                })
                .catch(() => {});
        };
        load();
        // Re-poll every 30s so when the cron writes a new lastPollAt the UI catches up
        // within a minute (the /api/stats response is also edge-cached for 30s).
        const id = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);
    return stats;
}

function useNowTick(): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

// ─── Stat formatters ──────────────────────────────────────────────────────────
function formatTimeAgo(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function formatLatency(ms: number): string {
    if (ms === 0) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatCount(n: number): string {
    return n.toLocaleString();
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
    const auth = useAuth();
    const stats = useStats();
    const nowMs = useNowTick();

    // Nav link style (shared)
    const navLinkStyle: React.CSSProperties = {
        color: "inherit",
        textDecoration: "none",
    };

    // Nav avatar style
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
        <div
            style={{
                width: "100%",
                minHeight: "100%",
                background: C.paper,
                color: C.ink,
                fontFamily: FB,
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* ====== HERO ====== */}
            <section style={{ position: "relative", height: 980, overflow: "hidden" }}>
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
                        padding: "24px 56px",
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
                        <a href="/app" style={navLinkStyle}>
                            Dashboard
                        </a>
                        <a href="/discover" style={{ ...navLinkStyle, opacity: 0.75 }}>
                            Picks
                        </a>
                        <a href="#faq" style={{ ...navLinkStyle, opacity: 0.75 }}>
                            Field Notes
                        </a>
                        <span style={{ width: 1, height: 14, background: "rgba(251,246,234,0.3)" }} />
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
                        position: "absolute",
                        inset: 0,
                        padding: "0 56px",
                        zIndex: 2,
                        display: "grid",
                        gridTemplateColumns: "1fr 360px",
                        gap: 56,
                        alignItems: "center",
                    }}
                >
                    <div>
                        <h1 style={{ margin: "0 0 26px", color: C.cream, textShadow: "0 1px 30px rgba(0,0,0,0.25)" }}>
                            <span
                                style={{
                                    font: `900 124px/0.86 ${FH}`,
                                    letterSpacing: "-0.01em",
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                NEVER MISS
                            </span>
                            <span
                                style={{
                                    font: `900 124px/0.86 ${FH}`,
                                    letterSpacing: "-0.01em",
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                A <span style={{ color: "#f6c79c" }}>CAMPSITE,</span>
                            </span>
                            <span
                                style={{
                                    font: `500 italic 88px/1 ${FI}`,
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
                                font: `400 18px/1.55 ${FB}`,
                                color: "rgba(251,246,234,0.92)",
                                maxWidth: 540,
                                margin: "0 0 32px",
                            }}
                        >
                            Recreation.gov sells out in minutes. CampWatch watches the sites you actually want, every five
                            minutes, and emails you the second one opens. No app, no notifications to babysit.
                        </p>
                        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                            {auth.isLoading ? (
                                <>
                                    <div
                                        style={{
                                            width: 200,
                                            height: 48,
                                            background: "rgba(251,246,234,0.15)",
                                            borderRadius: 2,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: 160,
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
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 10,
                                            borderRadius: 2,
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
                                    <a
                                        href="/discover"
                                        style={{
                                            font: `800 13px/1 ${FH}`,
                                            letterSpacing: "0.14em",
                                            textTransform: "uppercase",
                                            color: C.cream,
                                            padding: "16px 22px",
                                            textDecoration: "none",
                                            border: "1.5px solid rgba(251,246,234,0.6)",
                                            borderRadius: 2,
                                        }}
                                    >
                                        Browse the Picks
                                    </a>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Pinned bulletin card */}
                    <div style={{ position: "relative" }}>
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
                                <span style={{ textAlign: "right", color: C.clay }}>00:00:47</span>
                            </div>
                            <div style={{ margin: "12px 0 6px", height: 1, background: C.ruleSoft }} />
                            <div style={{ font: `600 italic 14px/1.4 ${FN}`, color: C.clay }}>
                                a quiet, perfect spot — N.L.
                            </div>
                        </div>
                        <div style={{ position: "absolute", bottom: -28, left: -34, transform: "rotate(-14deg)" }}>
                            <DPostmark />
                        </div>
                    </div>
                </div>

                {/* Hero attribution */}
            </section>

            {/* ====== LIVE STRIP ====== */}
            <section style={{ background: C.forestDeep, color: C.cream, padding: "32px 56px", position: "relative" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 48 }}>
                    {(
                        [
                            [
                                "Last poll",
                                stats ? formatTimeAgo(nowMs - new Date(stats.lastPollAt).getTime()) : "—",
                                C.mustard,
                                "ago",
                            ],
                            [
                                "Campgrounds tracked",
                                stats ? formatCount(stats.campgroundsTracked) : "—",
                                C.cream,
                                "sites",
                            ],
                            [
                                "Openings sent today",
                                stats ? formatCount(stats.openingsSentToday) : "—",
                                C.cream,
                                "emails",
                            ],
                            [
                                "Median latency",
                                stats ? formatLatency(stats.medianLatencyMs) : "—",
                                C.cream,
                                "to inbox",
                            ],
                        ] as const
                    ).map(([k, v, color, sub]) => (
                        <div key={k}>
                            <div
                                style={{
                                    font: `500 11px/1 ${FM}`,
                                    letterSpacing: "0.16em",
                                    color: "rgba(251,246,234,0.55)",
                                    textTransform: "uppercase",
                                }}
                            >
                                {k}
                            </div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                                <span
                                    style={{
                                        font: `900 36px/1 ${FH}`,
                                        color,
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    {v}
                                </span>
                                <span style={{ font: `500 italic 14px/1 ${FI}`, color: "rgba(251,246,234,0.55)" }}>
                                    {sub}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ====== DASHBOARD — postcard layout ====== */}
            <section style={{ padding: "120px 56px 110px", position: "relative" }}>
                <DTopo opacity={0.05} />

                {/* Handwritten arrow */}
                <div
                    style={{
                        position: "absolute",
                        left: 56,
                        top: 64,
                        font: `600 italic 20px/1.3 ${FN}`,
                        color: C.clay,
                        transform: "rotate(-3deg)",
                        maxWidth: 220,
                        zIndex: 2,
                    }}
                >
                    ↓ what your dashboard looks like
                </div>

                <div
                    style={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 64,
                        alignItems: "center",
                    }}
                >
                    {/* Left: header + copy + legend */}
                    <div>
                        <div
                            style={{
                                font: `500 11px/1 ${FM}`,
                                letterSpacing: "0.18em",
                                color: C.clay,
                                marginBottom: 14,
                            }}
                        >
                            THE WATCHLIST
                        </div>
                        <h2 style={{ margin: "0 0 24px", letterSpacing: "-0.005em" }}>
                            <span
                                style={{
                                    font: `900 64px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                EVERY PLACE
                            </span>
                            <span
                                style={{
                                    font: `900 64px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                YOU&apos;VE FALLEN FOR,
                            </span>
                            <span
                                style={{
                                    font: `900 64px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                    color: C.forest,
                                    marginTop: 4,
                                }}
                            >
                                WATCHING ITSELF.
                            </span>
                        </h2>
                        <p
                            style={{
                                font: `400 17px/1.6 ${FB}`,
                                color: C.inkSoft,
                                maxWidth: 460,
                                margin: "0 0 28px",
                            }}
                        >
                            Each row is a campground. Each bar is a single night, color-coded by how much you&apos;d want it:
                            dark green for the sites you&apos;ve starred, gold for &ldquo;I&apos;d take it,&rdquo; dimmed for
                            booked. The next eighteen weeks, at a glance.
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                            {(
                                [
                                    [C.forest, "favorite"],
                                    [C.mustard, "acceptable"],
                                    ["rgba(26,22,20,0.2)", "booked"],
                                ] as const
                            ).map(([color, label]) => (
                                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span
                                        style={{
                                            width: 12,
                                            height: 12,
                                            background: color,
                                            borderRadius: 2,
                                            display: "inline-block",
                                        }}
                                    />
                                    <span style={{ font: `500 italic 17px/1 ${FI}`, color: C.inkSoft }}>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: the postcard */}
                    <div style={{ position: "relative", perspective: "1400px" }}>
                        <div
                            style={{
                                background: C.cream,
                                padding: "24px 26px 22px",
                                border: "1px solid rgba(26,22,20,0.14)",
                                boxShadow:
                                    "0 30px 60px -20px rgba(26,22,20,0.35), 0 2px 0 rgba(26,22,20,0.05) inset",
                                transform: "rotate(-1.4deg)",
                                position: "relative",
                                backgroundImage:
                                    "radial-gradient(circle at 12px 12px, rgba(26,22,20,0.03) 0.8px, transparent 0.8px)",
                                backgroundSize: "4px 4px",
                            }}
                        >
                            {/* Postcard header */}
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    borderBottom: "1px dashed rgba(26,22,20,0.18)",
                                    paddingBottom: 14,
                                    marginBottom: 16,
                                    gap: 16,
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            font: `700 10px/1 ${FM}`,
                                            letterSpacing: "0.24em",
                                            textTransform: "uppercase",
                                            color: C.clay,
                                        }}
                                    >
                                        Your Watchlist · Spring &apos;26
                                    </div>
                                    <div
                                        style={{
                                            font: `500 italic 24px/1 ${FI}`,
                                            color: C.ink,
                                            marginTop: 8,
                                        }}
                                    >
                                        4 campgrounds · 18 weeks ahead
                                    </div>
                                </div>
                                <DStamp />
                            </div>

                            {(
                                [
                                    {
                                        name: "Outlet Campground",
                                        loc: "Redfish Lake, ID",
                                        pattern: "gg.gyg.ggyg.ggyggg.gygggy",
                                        tag: "3 open",
                                        tagColor: C.forest,
                                    },
                                    {
                                        name: "Pine Flats",
                                        loc: "Lowman, ID",
                                        pattern: "..yy....yy.....y......yy.",
                                        tag: "1 open",
                                        tagColor: C.mustard,
                                    },
                                    {
                                        name: "Stanley Lake",
                                        loc: "Stanley, ID",
                                        pattern: "...y.....y.......yyy.....",
                                        tag: "watching",
                                        tagColor: "rgba(26,22,20,0.5)",
                                    },
                                    {
                                        name: "Glacier View",
                                        loc: "West Glacier, MT",
                                        pattern: "g..gg.yy..ggg..y..gygy..y",
                                        tag: "2 open",
                                        tagColor: C.forest,
                                    },
                                ] as const
                            ).map((row, i, arr) => (
                                <div
                                    key={row.name}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr 90px",
                                        gap: 12,
                                        padding: "14px 0",
                                        alignItems: "center",
                                        borderBottom:
                                            i === arr.length - 1 ? "none" : "1px dotted rgba(26,22,20,0.16)",
                                    }}
                                >
                                    <div>
                                        <div style={{ font: `500 italic 22px/1.1 ${FI}`, color: C.ink }}>
                                            {row.name}
                                        </div>
                                        <div
                                            style={{
                                                font: `400 12px/1.2 ${FB}`,
                                                color: C.inkSoft,
                                                marginTop: 3,
                                            }}
                                        >
                                            {row.loc}
                                        </div>
                                    </div>
                                    <DBars pattern={row.pattern} />
                                    <span
                                        style={{
                                            justifySelf: "end",
                                            font: `600 11px/1 ${FM}`,
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            color:
                                                row.tagColor === "rgba(26,22,20,0.5)"
                                                    ? row.tagColor
                                                    : "#fff",
                                            background:
                                                row.tagColor === "rgba(26,22,20,0.5)"
                                                    ? "transparent"
                                                    : row.tagColor,
                                            padding: "6px 10px",
                                            borderRadius: 999,
                                            border:
                                                row.tagColor === "rgba(26,22,20,0.5)"
                                                    ? `1px solid ${row.tagColor}`
                                                    : "none",
                                        }}
                                    >
                                        {row.tag}
                                    </span>
                                </div>
                            ))}

                            {/* Postcard footer */}
                            <div
                                style={{
                                    marginTop: 12,
                                    paddingTop: 12,
                                    borderTop: "1px dashed rgba(26,22,20,0.18)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <span style={{ font: `500 italic 15px/1 ${FI}`, color: C.clay }}>
                                    Last poll · 47 seconds ago. All quiet.
                                </span>
                                <span
                                    style={{
                                        font: `500 11px/1 ${FM}`,
                                        color: C.inkSoft,
                                        letterSpacing: "0.14em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    signed N.L.
                                </span>
                            </div>
                        </div>

                        {/* Postmark over the corner */}
                        <div
                            style={{
                                position: "absolute",
                                top: -36,
                                right: -28,
                                transform: "rotate(14deg)",
                                opacity: 0.92,
                            }}
                        >
                            <DPostmark />
                        </div>

                        {/* Handwritten note */}
                        <div
                            style={{
                                position: "absolute",
                                bottom: -58,
                                left: -32,
                                transform: "rotate(-4deg)",
                                font: `600 22px/1.2 ${FN}`,
                                color: C.clay,
                                maxWidth: 240,
                            }}
                        >
                            wish you were here —<br />
                            <span style={{ fontSize: 18, color: C.inkSoft }}>your watchlist is.</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ====== HOW IT WORKS ====== */}
            <section
                style={{
                    padding: "88px 56px",
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
                        gridTemplateColumns: "260px 1fr",
                        gap: 64,
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
                                    font: `900 56px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                THREE SMALL THINGS,
                            </span>
                            <span
                                style={{
                                    font: `500 italic 44px/1 ${FI}`,
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
                                maxWidth: 240,
                            }}
                        >
                            Set it up once, in about a minute. Ignore us forever until summer.
                        </p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
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

            {/* ====== LETTER / EMAIL ====== */}
            <section style={{ padding: "96px 56px 80px", position: "relative" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
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
                                    font: `900 56px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                THE WHOLE PRODUCT
                            </span>
                            <span
                                style={{
                                    font: `500 italic 56px/1 ${FI}`,
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

                    {/* The letter, tilted */}
                    <div style={{ position: "relative" }}>
                        <div
                            style={{
                                background: C.cream,
                                padding: "28px 32px",
                                border: `1.5px solid ${C.ink}`,
                                boxShadow: `10px 10px 0 ${C.forest}`,
                                transform: "rotate(1.8deg)",
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

            {/* ====== FAQ ====== */}
            <section
                id="faq"
                style={{ padding: "80px 56px", background: C.forestDeep, color: C.cream, position: "relative" }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "300px 1fr",
                        gap: 64,
                        alignItems: "flex-start",
                    }}
                >
                    <div>
                        <div
                            style={{
                                font: `500 11px/1 ${FM}`,
                                letterSpacing: "0.18em",
                                color: C.mustard,
                                marginBottom: 10,
                            }}
                        >
                            COMMON QUESTIONS
                        </div>
                        <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                            <span
                                style={{
                                    font: `900 52px/0.95 ${FH}`,
                                    textTransform: "uppercase",
                                    display: "block",
                                }}
                            >
                                THINGS PEOPLE
                            </span>
                            <span
                                style={{
                                    font: `500 italic 44px/1 ${FI}`,
                                    display: "block",
                                    color: "#f6c79c",
                                    marginTop: 6,
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                ask, mostly around dusk.
                            </span>
                        </h2>
                    </div>
                    <div>
                        {(
                            [
                                {
                                    q: "How does CampWatch know when a site opens?",
                                    a: "It checks recreation.gov every 5 minutes for the campgrounds on your watchlist and compares what's available now against what was available last cycle. Anything new triggers an email.",
                                },
                                {
                                    q: "Is it really free?",
                                    a: (
                                        <>
                                            Yes. Side project, not a business. Runs on Cloudflare and GitHub Actions free tiers, no paid features planned. If you're curious how it works, the{" "}
                                            <a
                                                href="https://github.com/robertsmikej/campsites-react"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: C.mustard, textDecoration: "underline", textUnderlineOffset: 2 }}
                                            >
                                                source is on GitHub
                                            </a>
                                            .
                                        </>
                                    ),
                                },
                                {
                                    q: "Why Google sign-in only?",
                                    a: "Simpler than maintaining a password system, and gives us the email to notify. Your address is never used for anything else.",
                                },
                                {
                                    q: "Can I add any recreation.gov campground?",
                                    a: "Yes — once signed in, paste the campground ID from its recreation.gov URL into the configure dialog.",
                                },
                                {
                                    q: "How quickly will I get the alert?",
                                    a: "Median time from a site opening to an email in your inbox is about nine seconds. Recreation.gov doesn't notify you when your specific sites open — you'd have to keep refreshing the page. CampWatch does the refreshing for you and only emails when one of your starred sites actually comes available.",
                                },
                            ] as { q: string; a: React.ReactNode }[]
                        ).map(({ q, a }, i) => (
                            <div
                                key={i}
                                style={{
                                    padding: "18px 0",
                                    borderTop: i === 0 ? "1px solid rgba(239,230,210,0.2)" : "none",
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
                                        Q.0{i + 1}
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
                        ))}
                    </div>
                </div>
            </section>

            {/* ====== FOOTER ====== */}
            <footer
                style={{
                    background: C.waterDeep,
                    color: C.cream,
                    padding: "64px 56px 40px",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Horizon silhouette */}
                <svg
                    viewBox="0 0 1600 80"
                    preserveAspectRatio="none"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 80 }}
                >
                    <path
                        d="M 0 80 L 100 50 L 200 70 L 320 30 L 440 60 L 580 20 L 720 50 L 860 25 L 1000 60 L 1140 35 L 1280 65 L 1420 40 L 1600 60 L 1600 80 Z"
                        fill={C.forestNear}
                    />
                </svg>
                <div
                    style={{
                        position: "relative",
                        marginTop: 60,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                    }}
                >
                    <div>
                        <div
                            style={{
                                font: `900 72px/0.9 ${FH}`,
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
                    <div
                        style={{
                            textAlign: "right",
                            font: `500 11px/1.8 ${FM}`,
                            color: "rgba(251,246,234,0.7)",
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                        }}
                    >
                        <div
                            style={{
                                font: `500 10px/1 ${FM}`,
                                color: "rgba(251,246,234,0.5)",
                                letterSpacing: "0.18em",
                                marginBottom: 4,
                            }}
                        >
                            Get in touch
                        </div>
                        <div>
                            <a
                                href="mailto:hello@campwatch.app"
                                style={{ color: "inherit", textDecoration: "none" }}
                            >
                                hello@campwatch.app
                            </a>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <a
                                href="https://github.com/robertsmikej/campsites-react"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "inherit", textDecoration: "none" }}
                            >
                                Source on GitHub
                            </a>
                        </div>
                        <div>recreation.gov · NPS</div>
                        <div
                            style={{
                                marginTop: 8,
                                fontFamily: FI,
                                fontSize: 17,
                                textTransform: "none",
                                fontStyle: "italic",
                                letterSpacing: 0,
                                color: "#f6c79c",
                            }}
                        >
                            See you out there.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
