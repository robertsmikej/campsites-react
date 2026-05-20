"use client";

import { C, FH, FI, FB, FM, FN, PAD_M } from "@/components/field-notes/tokens";
import { DTopo } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";
import { PostcardHeader } from "./postcard-header";
import { PostcardRow } from "./postcard-row";
import { PostcardFooter } from "./postcard-footer";
import { PostcardDecorations } from "./postcard-decorations";

const ROWS = [
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
] as const;

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
                        <PostcardHeader />

                        {ROWS.map((row, i) => (
                            <PostcardRow
                                key={row.name}
                                name={row.name}
                                loc={row.loc}
                                pattern={row.pattern}
                                tag={row.tag}
                                tagColor={row.tagColor}
                                isLast={i === ROWS.length - 1}
                                isMobile={isMobile}
                            />
                        ))}

                        <PostcardFooter lastPollAt={stats?.lastPollAt} nowMs={nowMs} />
                    </div>

                    <PostcardDecorations isMobile={isMobile} />
                </div>
            </div>
        </section>
    );
}
