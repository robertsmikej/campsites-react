"use client";

import { C, FH, FI, FM } from "@/components/field-notes/tokens";
import { DCompass, DPostmark } from "@/components/field-notes/decorations";
import { formatTimeAgo } from "@/components/field-notes/format-time-ago";

interface BulletinCardProps {
    lastPollAt: string | undefined;
    nowMs: number;
}

export function BulletinCard({ lastPollAt, nowMs }: BulletinCardProps) {
    return (
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
                    <span style={{ textAlign: "right", color: C.clay }}>
                        {lastPollAt ? formatTimeAgo(nowMs - new Date(lastPollAt).getTime()) : "—"}
                    </span>
                </div>
                <div style={{ margin: "12px 0 6px", height: 1, background: C.ruleSoft }} />
                <div style={{ font: `600 italic 14px/1.4 ${FI}`, color: C.clay }}>
                    a quiet, perfect spot — N.L.
                </div>
            </div>
            <div style={{ position: "absolute", bottom: -28, left: -34, transform: "rotate(-14deg)" }}>
                <DPostmark />
            </div>
        </div>
    );
}
