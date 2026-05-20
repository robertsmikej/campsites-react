"use client";

import { C, FH, FI, FM, FN } from "@/components/field-notes/tokens";
import { LetterRow } from "./letter-row";
import type { AuthState } from "@/hooks/use-auth";

const LETTER_ROWS = [
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
] as const;

interface LetterCardProps {
    auth: AuthState;
    isMobile: boolean;
}

export function LetterCard({ auth, isMobile }: LetterCardProps) {
    return (
        <div style={{ position: "relative" }}>
            <div
                style={{
                    background: C.cream,
                    padding: isMobile ? "20px 18px" : "28px 32px",
                    border: `1.5px solid ${C.ink}`,
                    boxShadow: isMobile ? `6px 6px 0 ${C.forest}` : `10px 10px 0 ${C.forest}`,
                    transform: isMobile ? undefined : "rotate(1.8deg)",
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

                {LETTER_ROWS.map((e) => (
                    <LetterRow key={e.name} name={e.name} date={e.date} tag={e.tag} />
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
    );
}
