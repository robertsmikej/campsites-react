"use client";

import React from "react";
import { C, FH, FI, FB, FM, FN, PAD_M } from "@/components/field-notes/tokens";
import { DTopo, DPostmark, DStamp, DBars } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";

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

export function WatchlistPostcard() {
    const isMobile = useIsMobile();
    const { stats, nowMs } = useStats();

    return (
        <section style={{ padding: isMobile ? `60px ${PAD_M}px 50px` : "120px 56px 110px", position: "relative" }}>
            <DTopo opacity={0.05} />

            {/* Handwritten arrow — desktop only */}
            {!isMobile && (
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
            )}

            <div
                style={{
                    position: "relative",
                    display: isMobile ? "flex" : "grid",
                    flexDirection: isMobile ? "column" : undefined,
                    gridTemplateColumns: isMobile ? undefined : "1fr 1fr",
                    gap: isMobile ? 24 : 64,
                    alignItems: isMobile ? undefined : "center",
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
                                font: `900 ${isMobile ? 44 : 64}px/0.95 ${FH}`,
                                textTransform: "uppercase",
                                display: "block",
                            }}
                        >
                            EVERY PLACE
                        </span>
                        <span
                            style={{
                                font: `900 ${isMobile ? 44 : 64}px/0.95 ${FH}`,
                                textTransform: "uppercase",
                                display: "block",
                            }}
                        >
                            YOU&apos;VE FALLEN FOR,
                        </span>
                        <span
                            style={{
                                font: `900 ${isMobile ? 44 : 64}px/0.95 ${FH}`,
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
                <div style={{ position: "relative", perspective: isMobile ? undefined : "1400px" }}>
                    <div
                        style={{
                            background: C.cream,
                            padding: isMobile ? 18 : "24px 26px 22px",
                            border: "1px solid rgba(26,22,20,0.14)",
                            boxShadow:
                                isMobile
                                    ? "0 14px 30px -12px rgba(26,22,20,0.3)"
                                    : "0 30px 60px -20px rgba(26,22,20,0.35), 0 2px 0 rgba(26,22,20,0.05) inset",
                            transform: isMobile ? undefined : "rotate(-1.4deg)",
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
                                    padding: "12px 0",
                                    borderBottom:
                                        i === arr.length - 1 ? "none" : "1px dotted rgba(26,22,20,0.16)",
                                }}
                            >
                                {isMobile ? (
                                    <>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ font: `500 italic 20px/1.1 ${FI}`, color: C.ink }}>{row.name}</div>
                                                <div style={{ font: `400 12px/1.2 ${FB}`, color: C.inkSoft, marginTop: 3 }}>{row.loc}</div>
                                            </div>
                                            <span
                                                style={{
                                                    font: `600 10px/1 ${FM}`,
                                                    letterSpacing: "0.06em",
                                                    textTransform: "uppercase",
                                                    color: row.tagColor === "rgba(26,22,20,0.5)" ? row.tagColor : "#fff",
                                                    background: row.tagColor === "rgba(26,22,20,0.5)" ? "transparent" : row.tagColor,
                                                    padding: "5px 8px",
                                                    borderRadius: 999,
                                                    border: row.tagColor === "rgba(26,22,20,0.5)" ? `1px solid ${row.tagColor}` : "none",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {row.tag}
                                            </span>
                                        </div>
                                        <div style={{ marginTop: 10 }}><DBars pattern={row.pattern} /></div>
                                    </>
                                ) : (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 12, alignItems: "center" }}>
                                        <div>
                                            <div style={{ font: `500 italic 22px/1.1 ${FI}`, color: C.ink }}>{row.name}</div>
                                            <div style={{ font: `400 12px/1.2 ${FB}`, color: C.inkSoft, marginTop: 3 }}>{row.loc}</div>
                                        </div>
                                        <DBars pattern={row.pattern} />
                                        <span
                                            style={{
                                                justifySelf: "end",
                                                font: `600 11px/1 ${FM}`,
                                                letterSpacing: "0.08em",
                                                textTransform: "uppercase",
                                                color: row.tagColor === "rgba(26,22,20,0.5)" ? row.tagColor : "#fff",
                                                background: row.tagColor === "rgba(26,22,20,0.5)" ? "transparent" : row.tagColor,
                                                padding: "6px 10px",
                                                borderRadius: 999,
                                                border: row.tagColor === "rgba(26,22,20,0.5)" ? `1px solid ${row.tagColor}` : "none",
                                            }}
                                        >
                                            {row.tag}
                                        </span>
                                    </div>
                                )}
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
                                {stats
                                    ? `Last poll · ${formatTimeAgo(nowMs - new Date(stats.lastPollAt).getTime())} ago. All quiet.`
                                    : "Polling resumes shortly."}
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

                    {/* Postmark over the corner — desktop only */}
                    {!isMobile && (
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
                    )}

                    {/* Handwritten note */}
                    <div
                        style={isMobile ? {
                            marginTop: 18,
                            textAlign: "center",
                            font: `600 20px/1.2 ${FN}`,
                            color: C.clay,
                            transform: "rotate(-1deg)",
                        } : {
                            position: "absolute",
                            bottom: -58,
                            left: -32,
                            transform: "rotate(-4deg)",
                            font: `600 22px/1.2 ${FN}`,
                            color: C.clay,
                            maxWidth: 240,
                        }}
                    >
                        wish you were here —{isMobile ? " " : <br />}
                        <span style={{ fontSize: 18, color: C.inkSoft }}>your watchlist is.</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
