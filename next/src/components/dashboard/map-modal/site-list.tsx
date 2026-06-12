"use client";

import type { JSX } from "react";
import { CW } from "@/components/field-notes/cw-tokens";
import { ListMarker, TypeBadge, SiteInfoChips, StarRating } from "./site-info";
import type { MapSite } from "@/lib/map-sites";

// ─── SiteRow ──────────────────────────────────────────────────────────────────

function SiteRow({
    site,
    selected,
    hovered,
    onSelect,
    onHover,
}: {
    site: MapSite;
    selected: boolean;
    hovered: boolean;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
}): JSX.Element {
    const isFav = site.tier === "fav";
    const accentColor = isFav ? CW.clay : CW.forest;

    const rowBg = selected
        ? `color-mix(in srgb, ${accentColor} 12%, var(--cw-paper))`
        : hovered
          ? `color-mix(in srgb, ${accentColor} 7%, var(--cw-paper))`
          : "transparent";

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(site.id)}
            onMouseEnter={() => onHover(site.id)}
            onMouseLeave={() => onHover(null)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(site.id);
                }
            }}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 4,
                background: rowBg,
                cursor: "pointer",
                borderLeft: `3px solid ${selected ? accentColor : "transparent"}`,
                transition: "background 0.12s ease",
            }}
        >
            {/* Left: marker */}
            <ListMarker id={site.id} open={site.open} favorite={isFav} selected={selected} />

            {/* Middle: type + chips */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TypeBadge type={site.type} maxRvLength={site.maxRvLength} />
                </div>
                <SiteInfoChips site={site} />
            </div>

            {/* Right: open count + action */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                    flexShrink: 0,
                }}
            >
                {site.open ? (
                    <>
                        <span
                            className="font-mono-field"
                            style={{ fontSize: 10, color: CW.forest, fontWeight: 600 }}
                        >
                            {site.openCount} open window{site.openCount !== 1 ? "s" : ""}
                        </span>
                        <a
                            href={`https://www.recreation.gov/camping/campsites/${site.campsiteId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono-field font-semibold uppercase no-underline"
                            style={{
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                color: CW.cream,
                                background: CW.forest,
                                padding: "3px 7px",
                                borderRadius: 3,
                            }}
                        >
                            Book →
                        </a>
                    </>
                ) : (
                    <span
                        className="font-mono-field"
                        style={{ fontSize: 10, color: isFav ? CW.clay : CW.inkSoft }}
                    >
                        {isFav ? "Booked" : "Watching"}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── SiteList ─────────────────────────────────────────────────────────────────

export function SiteList({
    sites,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
}: {
    sites: MapSite[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string) => void;
    onHover: (id: string | null) => void;
}): JSX.Element {
    const total = sites.length;
    const openCount = sites.filter((s) => s.open).length;

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 0,
                height: "100%",
            }}
        >
            {/* Header */}
            <div
                className="font-mono-field font-semibold uppercase"
                style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    color: openCount > 0 ? CW.forest : CW.inkSoft,
                    padding: "0 12px 10px",
                    borderBottom: `1px solid var(--cw-rule)`,
                    marginBottom: 6,
                }}
            >
                {total} of {total} sites · {openCount} open
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {sites.map((site) => (
                    <SiteRow
                        key={site.id}
                        site={site}
                        selected={selectedId === site.id}
                        hovered={hoveredId === site.id}
                        onSelect={onSelect}
                        onHover={onHover}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── SitePopover ──────────────────────────────────────────────────────────────

const SHADE_LABEL: Record<string, string> = {
    full: "Full shade",
    partial: "Partial shade",
    sun: "Full sun",
};

export function SitePopover({
    site,
    onClose,
}: {
    site: MapSite;
    campgroundId: string;
    onClose: () => void;
}): JSX.Element {
    const isFav = site.tier === "fav";

    return (
        <div
            style={{
                width: 248,
                background: CW.cream,
                border: `1.5px solid ${CW.ink}`,
                boxShadow: `5px 5px 0 ${CW.forest}`,
                borderRadius: 2,
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
            }}
        >
            {/* Close */}
            <button
                type="button"
                aria-label="Close popover"
                onClick={onClose}
                style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: CW.inkSoft,
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 2,
                }}
            >
                ×
            </button>

            {/* Site id + type row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <ListMarker id={site.id} open={site.open} favorite={isFav} selected={false} />
                <TypeBadge type={site.type} maxRvLength={site.maxRvLength} />
            </div>

            {/* Rating */}
            <StarRating value={site.rating} reviews={site.reviews} />

            {/* Amenity grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "5px 10px",
                }}
            >
                {site.shade != null && (
                    <div
                        className="font-mono-field"
                        style={{ fontSize: 10, color: CW.inkSoft, gridColumn: "1 / -1" }}
                    >
                        {SHADE_LABEL[site.shade] ?? site.shade}
                    </div>
                )}
                {site.cell !== null && (
                    <div className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                        Cell: {site.cell >= 3 ? "Good" : site.cell >= 1 ? "Weak" : "None"}
                    </div>
                )}
                {site.amenities.firePit && (
                    <div className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                        🔥 Fire pit
                    </div>
                )}
                {site.amenities.accessible && (
                    <div className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                        ♿ Accessible
                    </div>
                )}
                {site.maxRvLength != null && (
                    <div className="font-mono-field" style={{ fontSize: 10, color: CW.inkSoft }}>
                        Max RV: {site.maxRvLength}ft
                    </div>
                )}
            </div>

            {/* CTA */}
            {site.open ? (
                <a
                    href={`https://www.recreation.gov/camping/campsites/${site.campsiteId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono-field font-semibold uppercase no-underline"
                    style={{
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        color: CW.cream,
                        background: CW.forest,
                        padding: "8px 12px",
                        borderRadius: 3,
                        display: "block",
                        textAlign: "center",
                        marginTop: 2,
                    }}
                >
                    Book on recreation.gov →
                </a>
            ) : (
                <div
                    className="font-mono-field"
                    style={{
                        fontSize: 10,
                        color: CW.inkSoft,
                        textAlign: "center",
                        padding: "6px 0",
                    }}
                >
                    Booked — watching
                </div>
            )}
        </div>
    );
}
