"use client";

import React from "react";
import { C, FH, FI, FM, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";

export function Footer() {
    const isMobile = useIsMobile();

    return (
        <footer
            style={{
                background: C.waterDeep,
                color: C.cream,
                padding: isMobile ? `48px ${PAD_M}px 32px` : "64px 56px 40px",
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
                    display: isMobile ? "block" : "flex",
                    justifyContent: isMobile ? undefined : "space-between",
                    alignItems: isMobile ? undefined : "flex-end",
                }}
            >
                <div>
                    <div
                        style={{
                            font: `900 ${isMobile ? 48 : 72}px/0.9 ${FH}`,
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
                        textAlign: isMobile ? "left" : "right",
                        font: `500 11px/1.8 ${FM}`,
                        color: "rgba(251,246,234,0.7)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        marginTop: isMobile ? 24 : undefined,
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
    );
}
