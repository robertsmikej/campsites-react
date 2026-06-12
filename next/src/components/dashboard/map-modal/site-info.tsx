"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import type { MapSite } from "@/lib/map-sites";
import type { JSX } from "react";

// ─── StarRating ────────────────────────────────────────────────────────────────

export function StarRating({ value, reviews }: { value: number | null; reviews: number }): JSX.Element {
    if (value === null) {
        return (
            <span className="font-mono-field" style={{ fontSize: 11, color: CW.inkFaint }}>
                No ratings
            </span>
        );
    }

    // Build 5 star glyphs with partial fill via clip-path trick on a filled star over empty
    const stars = Array.from({ length: 5 }, (_, i) => {
        const filled = Math.min(Math.max(value - i, 0), 1);
        if (filled >= 1) return "★";
        if (filled > 0) return "½";
        return "☆";
    });

    return (
        <span className="inline-flex items-baseline gap-1">
            <span className="font-mono-field font-bold" style={{ fontSize: 13, color: CW.mustard }}>
                {stars.map((s, i) => (
                    <span key={i} aria-hidden>
                        {s === "½" ? (
                            <span style={{ position: "relative", display: "inline-block" }}>
                                <span style={{ color: CW.inkFaint }}>☆</span>
                                <span
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        top: 0,
                                        overflow: "hidden",
                                        width: "50%",
                                        color: CW.mustard,
                                    }}
                                >
                                    ★
                                </span>
                            </span>
                        ) : s === "☆" ? (
                            <span style={{ color: CW.inkFaint }}>☆</span>
                        ) : (
                            "★"
                        )}
                    </span>
                ))}
            </span>
            <span className="font-mono-field font-semibold" style={{ fontSize: 12, color: CW.ink }}>
                {value}
            </span>
            <span className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                ({reviews})
            </span>
        </span>
    );
}

// ─── CellSignal ────────────────────────────────────────────────────────────────

function cellLabel(level: number | null): { label: string; color: string } {
    if (level === null || level === 0) return { label: "None", color: CW.inkFaint };
    if (level >= 3) return { label: "Good", color: CW.forest };
    return { label: "Weak", color: CW.mustard };
}

export function CellSignal({ level }: { level: number | null }): JSX.Element {
    const { label, color } = cellLabel(level);
    const bars = level ?? 0;

    return (
        <span className="inline-flex items-center gap-1">
            {/* 4 bar indicators */}
            <span className="inline-flex items-end gap-[2px]" aria-hidden style={{ height: 12 }}>
                {[1, 2, 3, 4].map((bar) => (
                    <span
                        key={bar}
                        style={{
                            display: "inline-block",
                            width: 3,
                            height: bar * 3,
                            borderRadius: 1,
                            background: bar <= bars ? color : CW.inkFaint,
                            opacity: bar <= bars ? 1 : 0.35,
                        }}
                    />
                ))}
            </span>
            <span
                className="font-mono-field font-semibold"
                style={{ fontSize: 10, color, letterSpacing: "0.04em" }}
            >
                {label}
            </span>
        </span>
    );
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
    rv: "RV",
    walkin: "Walk-in",
    tent: "Tent",
    other: "Site",
};

export function TypeBadge({
    type,
    maxRvLength,
}: {
    type: "tent" | "rv" | "walkin" | "other";
    maxRvLength?: number;
}): JSX.Element {
    const label = TYPE_LABEL[type] ?? "Site";

    return (
        <span className="inline-flex items-center gap-1">
            <span
                className="font-mono-field font-semibold uppercase"
                style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: CW.forest,
                    border: `1px solid ${CW.forest}`,
                    borderRadius: 3,
                    padding: "2px 5px",
                }}
            >
                {label}
            </span>
            {type === "rv" && maxRvLength != null && (
                <span className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                    {maxRvLength}ft max
                </span>
            )}
        </span>
    );
}

// ─── SiteInfoChips ─────────────────────────────────────────────────────────────

const SHADE_LABEL: Record<string, string> = {
    full: "Full shade",
    partial: "Partial shade",
    sun: "Full sun",
};

export function SiteInfoChips({ site }: { site: MapSite }): JSX.Element {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Rating */}
            {site.rating !== null && <StarRating value={site.rating} reviews={site.reviews} />}

            {/* Type */}
            <TypeBadge type={site.type} maxRvLength={site.maxRvLength} />

            {/* Shade */}
            {site.shade != null && (
                <span className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                    {SHADE_LABEL[site.shade] ?? site.shade}
                </span>
            )}

            {/* Cell signal */}
            {site.cell !== null && <CellSignal level={site.cell} />}

            {/* Amenities */}
            {site.amenities.firePit && (
                <span
                    className="font-mono-field"
                    style={{ fontSize: 10, color: CW.inkSoft }}
                    title="Fire pit"
                >
                    🔥
                </span>
            )}
            {site.amenities.accessible && (
                <span
                    className="font-mono-field"
                    style={{ fontSize: 10, color: CW.inkSoft }}
                    title="Accessible"
                >
                    ♿
                </span>
            )}
        </div>
    );
}

// ─── ListMarker ───────────────────────────────────────────────────────────────

export function ListMarker({
    id,
    open,
    favorite,
    selected,
}: {
    id: string;
    open: boolean;
    favorite: boolean;
    selected: boolean;
}): JSX.Element {
    const bgColor = selected ? CW.forest : favorite ? CW.clay : open ? CW.forestBright : CW.inkFaint;

    const textColor = selected || favorite || open ? CW.paper : CW.ink;

    return (
        <span
            data-open={open}
            data-favorite={favorite}
            data-selected={selected}
            className="font-mono-field inline-flex items-center justify-center font-bold"
            style={{
                fontSize: 11,
                minWidth: 32,
                padding: "3px 6px",
                borderRadius: 4,
                background: bgColor,
                color: textColor,
                letterSpacing: "0.03em",
                border: selected ? `2px solid ${CW.forestDeep}` : "2px solid transparent",
                boxShadow: selected ? `0 0 0 1px ${CW.forestDeep}` : undefined,
            }}
        >
            {favorite && (
                <span aria-hidden style={{ marginRight: 2, fontSize: 9 }}>
                    ★
                </span>
            )}
            {id}
        </span>
    );
}
