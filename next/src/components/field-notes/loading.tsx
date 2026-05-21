"use client";

// ─── Field Notes loading primitives ──────────────────────────────────────────
//
// Three building blocks; use them everywhere a loading state is needed:
//
//   <LoadingPlaceholder />  — em-dash, for single-stat tiles (stats band, open-count badge)
//   <LoadingText>           — italic Cormorant phrase, for short status lines and section blocks
//   <LoadingGhostRow />     — bg-cw-rule-soft rectangle, for multi-row list skeletons
//
// Design contract:
//   • No shadcn <Skeleton>. The bg-cw-rule-soft token is theme-aware and
//     matches the Field Notes palette without pulling in extra infrastructure.
//   • Animations are subtle: a gentle opacity pulse via Tailwind's
//     animate-pulse (already in the config).
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

// ─── Single em-dash — for numeric tile loading states ────────────────────────
export function LoadingPlaceholder() {
    return <span aria-label="Loading">—</span>;
}

// ─── Italic Cormorant phrase — for short status lines ─────────────────────────
interface LoadingTextProps {
    children?: ReactNode;
    className?: string;
}

export function LoadingText({ children = "Loading…", className }: LoadingTextProps) {
    return (
        <span
            className={`font-italic-serif italic font-medium text-cw-ink-soft ${className ?? ""}`}
            aria-label="Loading"
        >
            {children}
        </span>
    );
}

// ─── Ghost row — bg-cw-rule-soft rectangle for list skeletons ─────────────────
interface LoadingGhostRowProps {
    /** Height of the ghost row in pixels. Defaults to 56 (≈ one watchlist row). */
    height?: number;
    className?: string;
}

export function LoadingGhostRow({ height = 56, className }: LoadingGhostRowProps) {
    return (
        <div
            className={`animate-pulse rounded-[2px] bg-cw-rule-soft ${className ?? ""}`}
            style={{ height }}
            aria-hidden="true"
        />
    );
}
