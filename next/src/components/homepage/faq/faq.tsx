"use client";

import React, { useState, useEffect } from "react";
import { C, FM } from "@/components/field-notes/tokens";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { FaqIntro } from "./faq-intro";
import { FaqItem } from "./faq-item";

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

    const items: { q: string; a: React.ReactNode }[] = [
        {
            q: "How does CampWatch know when a site opens?",
            a: "It checks recreation.gov every 5 minutes for the campgrounds on your watchlist and compares what's available now against what was available last cycle. Anything new triggers an email.",
        },
        {
            q: "Is it really free?",
            a: (
                <>
                    Yes. Side project, not a business, and cheap to run — no paid features planned. If
                    you&apos;re curious how it works, the{" "}
                    <a
                        href="https://github.com/robertsmikej/campsites-react"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cw-mustard underline [text-underline-offset:2px]"
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
                    . Recreation.gov doesn&apos;t notify you when your specific sites open — you&apos;d have
                    to keep refreshing the page. CampWatch does the refreshing for you and only emails when
                    one of your starred sites actually comes available.
                </>
            ),
        },
    ];

    return (
        <section
            id="faq"
            className="relative py-[60px] px-[22px] md:py-20 md:px-14 bg-[#142a1d] text-cw-cream"
        >
            <style>{`
                details.cw-faq > summary::-webkit-details-marker { display: none; }
                details.cw-faq > summary { list-style: none; }
            `}</style>
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-7 md:gap-16 items-start">
                <FaqIntro />
                <div>
                    {items.map(({ q, a }, i) => (
                        <FaqItem key={i} q={q} a={a} index={i} isMobile={isMobile} />
                    ))}
                </div>
            </div>
        </section>
    );
}
