"use client";

import React from "react";
import { C, FM, FH, FI } from "./tokens";

// ─── Topographic contour lines ───────────────────────────────────────────────
export function DTopo({ opacity = 0.08, stroke = C.forest }: { opacity?: number; stroke?: string }) {
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
                pts
                    .map((pt, idx) => (idx ? "L" : "M") + pt[0].toFixed(1) + "," + pt[1].toFixed(1))
                    .join(" ") + "Z";
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
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity }}
        >
            {lines}
        </svg>
    );
}

// ─── Dusk lake scene ─────────────────────────────────────────────────────────
export function DScene() {
    return (
        <svg
            viewBox="0 0 1600 900"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full block"
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
                return (
                    <line
                        key={i}
                        x1={x}
                        y1={y}
                        x2={x + w}
                        y2={y}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="0.8"
                    />
                );
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
export function DCompass({ size = 56, color = C.cream }: { size?: number; color?: string }) {
    return (
        <svg viewBox="0 0 64 64" width={size} height={size} className="block">
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
export function DPostmark({
    size = 100,
    label = "CHECKED EVERY · V MIN",
    date = "EST · MMXXVI",
}: {
    size?: number;
    label?: string;
    date?: string;
}) {
    return (
        <svg viewBox="0 0 120 120" width={size} height={size} className="block">
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
export function DStamp() {
    return (
        <div
            className="w-20 h-[100px] relative flex-shrink-0 p-1 border border-[rgba(29,24,21,0.18)]"
            style={{
                background: `radial-gradient(circle at 4px 4px, ${C.paper} 1.5px, transparent 1.5px) 0 0 / 8px 8px, ${C.cream}`,
            }}
        >
            <div
                className="w-full h-full relative overflow-hidden"
                style={{
                    background: `linear-gradient(180deg, ${C.skyMid} 0%, ${C.skyLow} 50%, ${C.water} 51%, ${C.waterDeep} 100%)`,
                }}
            >
                <svg viewBox="0 0 80 100" className="w-full h-full block">
                    <path
                        d="M 0 55 L 20 35 L 40 50 L 60 32 L 80 48 L 80 60 L 0 60 Z"
                        fill={C.mountainShadow}
                    />
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
export function DBadge({ children, color = C.clay }: { children: React.ReactNode; color?: string }) {
    return (
        <span
            className="font-mono-field text-[11px] leading-none tracking-[0.16em] uppercase rounded-[2px] bg-transparent py-[5px] px-2 font-bold"
            style={{ color, border: `1px solid ${color}` }}
        >
            {children}
        </span>
    );
}

// ─── Availability bars ────────────────────────────────────────────────────────
export function DBars({
    pattern,
    accent = C.forest,
    secondary = C.mustard,
}: {
    pattern: string;
    accent?: string;
    secondary?: string;
}) {
    return (
        <div className="flex gap-[2px] items-end h-[26px]">
            {pattern.split("").map((ch, i) => {
                const h = ch === "." ? 5 : ch === "y" ? 16 : 22;
                const bg = ch === "." ? "rgba(26,22,20,0.15)" : ch === "y" ? secondary : accent;
                return (
                    <div key={i} className="w-[6px] rounded-[1px]" style={{ height: h, background: bg }} />
                );
            })}
        </div>
    );
}
