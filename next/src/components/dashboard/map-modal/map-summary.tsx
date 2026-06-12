"use client";

import type { JSX } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import type { MapSite } from "@/lib/map-sites";

interface TileProps {
    label: string;
    value: string;
    color: string;
    glyph?: string;
}

function Tile({ label, value, color, glyph }: TileProps): JSX.Element {
    return (
        <div
            style={{
                flex: "1 1 0",
                minWidth: 80,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                padding: "10px 14px",
                border: `1px solid var(--cw-rule)`,
                borderRadius: 3,
                background: "transparent",
            }}
        >
            <div
                className="font-poster font-black"
                style={{ fontSize: 28, lineHeight: 1, color, letterSpacing: "-0.01em" }}
            >
                {glyph && (
                    <span style={{ fontSize: 18, marginRight: 4, verticalAlign: "middle" }}>{glyph}</span>
                )}
                {value}
            </div>
            <div
                className="font-mono-field font-medium uppercase"
                style={{ fontSize: 9, letterSpacing: "0.18em", color: CW.inkSoft }}
            >
                {label}
            </div>
        </div>
    );
}

export function MapSummary({ sites }: { sites: MapSite[] }): JSX.Element {
    const total = sites.length;
    const open = sites.filter((s) => s.open).length;
    const favCount = sites.filter((s) => s.tier === "fav").length;

    const ratingsWithValues = sites.map((s) => s.rating).filter((r): r is number => r !== null);
    const avgRating =
        ratingsWithValues.length > 0
            ? ratingsWithValues.reduce((a, b) => a + b, 0) / ratingsWithValues.length
            : null;

    return (
        <div
            style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
            }}
        >
            <Tile label={`Sites open / ${total} total`} value={`${open}/${total}`} color={CW.forest} />
            <Tile label="Favorites" value={String(favCount)} color={CW.clay} glyph="★" />
            <Tile
                label="Avg rating"
                value={avgRating !== null ? avgRating.toFixed(1) : "—"}
                color={CW.mustard}
                glyph="★"
            />
        </div>
    );
}
