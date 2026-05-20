"use client";

import React, { useState, useEffect } from "react";
import { C, FH, FI, FB, FM, PAD_M } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface NotifierStats {
    lastPollAt: string;
    campgroundsTracked: number;
    openingsSentToday: number;
    openingsSentLast7Days: number;
    medianLatencyMs: number;
    sampleSize: number;
    todayKey: string;
}

function useStats(): NotifierStats | null {
    const [stats, setStats] = useState<NotifierStats | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = () => {
            fetch("/api/stats")
                .then((r) => (r.ok ? r.json() : null))
                .then((data: unknown) => {
                    if (cancelled) return;
                    setStats(data as NotifierStats | null);
                })
                .catch(() => {});
        };
        load();
        const id = setInterval(load, 30_000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);
    return stats;
}

function formatLatency(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export function Faq() {
    const isMobile = useIsMobile();
    const stats = useStats();

    return (
        <section
            id="faq"
            style={{ padding: isMobile ? `60px ${PAD_M}px` : "80px 56px", background: C.forestDeep, color: C.cream, position: "relative" }}
        >
            <style>{`
                details.cw-faq > summary::-webkit-details-marker { display: none; }
                details.cw-faq > summary { list-style: none; }
            `}</style>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "300px 1fr",
                    gap: isMobile ? 28 : 64,
                    alignItems: "flex-start",
                }}
            >
                <div>
                    <div
                        style={{
                            font: `500 11px/1 ${FM}`,
                            letterSpacing: "0.18em",
                            color: C.mustard,
                            marginBottom: 10,
                        }}
                    >
                        COMMON QUESTIONS
                    </div>
                    <h2 style={{ margin: 0, letterSpacing: "-0.005em" }}>
                        <span
                            style={{
                                font: `900 ${isMobile ? 44 : 52}px/0.95 ${FH}`,
                                textTransform: "uppercase",
                                display: "block",
                            }}
                        >
                            THINGS PEOPLE
                        </span>
                        <span
                            style={{
                                font: `500 italic ${isMobile ? 36 : 44}px/1 ${FI}`,
                                display: "block",
                                color: "#f6c79c",
                                marginTop: 6,
                                letterSpacing: "-0.01em",
                            }}
                        >
                            ask, mostly around dusk.
                        </span>
                    </h2>
                </div>
                <div>
                    {(
                        [
                            {
                                q: "How does CampWatch know when a site opens?",
                                a: "It checks recreation.gov every 5 minutes for the campgrounds on your watchlist and compares what's available now against what was available last cycle. Anything new triggers an email.",
                            },
                            {
                                q: "Is it really free?",
                                a: (
                                    <>
                                        Yes. Side project, not a business. Runs on Cloudflare and GitHub Actions free tiers, no paid features planned. If you're curious how it works, the{" "}
                                        <a
                                            href="https://github.com/robertsmikej/campsites-react"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: C.mustard, textDecoration: "underline", textUnderlineOffset: 2 }}
                                        >
                                            source is on GitHub
                                        </a>
                                        .
                                    </>
                                ),
                            },
                            {
                                q: "Why Google sign-in only?",
                                a: "Simpler than maintaining a password system, and gives us the email to notify. Your address is never used for anything else.",
                            },
                            {
                                q: "Can I add any recreation.gov campground?",
                                a: "Yes — once signed in, paste the campground ID from its recreation.gov URL into the configure dialog.",
                            },
                            {
                                q: "How quickly will I get the alert?",
                                a: (
                                    <>
                                        Median time from a site opening to an email in your inbox is currently{" "}
                                        <span style={{ color: C.mustard, fontFamily: FM, letterSpacing: "0.04em" }}>
                                            {stats && stats.sampleSize > 0
                                                ? formatLatency(stats.medianLatencyMs)
                                                : "well under a minute"}
                                        </span>
                                        . Recreation.gov doesn&apos;t notify you when your specific sites open — you&apos;d have to keep refreshing the page. CampWatch does the refreshing for you and only emails when one of your starred sites actually comes available.
                                    </>
                                ),
                            },
                        ] as { q: string; a: React.ReactNode }[]
                    ).map(({ q, a }, i) => isMobile ? (
                        <details
                            key={i}
                            className="cw-faq"
                            style={{
                                padding: "14px 0",
                                borderTop: i === 0 ? "1px solid rgba(239,230,210,0.18)" : "none",
                                borderBottom: "1px solid rgba(239,230,210,0.18)",
                            }}
                        >
                            <summary
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 14,
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                    <span style={{ font: `500 10px/1.6 ${FM}`, color: C.mustard, letterSpacing: "0.12em", flexShrink: 0 }}>Q.0{i + 1}</span>
                                    <h3 style={{ font: `500 italic 19px/1.3 ${FI}`, color: C.cream, margin: 0, letterSpacing: "-0.005em" }}>{q}</h3>
                                </div>
                                <span style={{ font: `500 20px/1 ${FH}`, color: C.mustard, flexShrink: 0 }}>+</span>
                            </summary>
                            <p style={{ font: `400 14px/1.55 ${FB}`, color: "rgba(239,230,210,0.82)", margin: "12px 0 0 26px" }}>{a}</p>
                        </details>
                    ) : (
                        <div
                            key={i}
                            style={{
                                padding: "18px 0",
                                borderTop: i === 0 ? "1px solid rgba(239,230,210,0.2)" : "none",
                                borderBottom: "1px solid rgba(239,230,210,0.2)",
                            }}
                        >
                            <div style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 16 }}>
                                <span
                                    style={{
                                        font: `500 11px/1 ${FM}`,
                                        color: C.mustard,
                                        letterSpacing: "0.12em",
                                        paddingTop: 6,
                                    }}
                                >
                                    Q.0{i + 1}
                                </span>
                                <div>
                                    <h3 style={{ margin: "0 0 10px", letterSpacing: "-0.005em" }}>
                                        <span style={{ font: `500 italic 24px/1.2 ${FI}`, color: C.cream }}>
                                            {q}
                                        </span>
                                    </h3>
                                    <p
                                        style={{
                                            font: `400 15px/1.55 ${FB}`,
                                            color: "rgba(239,230,210,0.82)",
                                            margin: 0,
                                            maxWidth: 640,
                                        }}
                                    >
                                        {a}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
