"use client";

import { C } from "@/components/field-notes/tokens";
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
        <section className="relative py-[60px] px-[22px] md:py-[120px] md:px-14 md:pb-[110px]">
            <DTopo opacity={0.05} />

            {/* Handwritten arrow — desktop only */}
            {!isMobile && (
                <div className="absolute left-14 top-16 font-hand text-[20px] leading-[1.3] text-cw-clay -rotate-[3deg] max-w-[220px] z-[2] font-semibold italic">
                    ↓ what your dashboard looks like
                </div>
            )}

            <div className="relative flex flex-col md:grid md:grid-cols-2 gap-6 md:gap-16 md:items-center">
                {/* Left: header + copy + legend */}
                <div>
                    <div className="font-mono-field text-[13px] leading-none tracking-[0.18em] text-cw-clay mb-[14px] font-medium uppercase">
                        THE WATCHLIST
                    </div>
                    <h2 className="m-0 mb-6 tracking-[-0.005em]">
                        <span className="font-poster text-[44px] md:text-[64px] leading-[0.95] uppercase block font-black">
                            EVERY PLACE
                        </span>
                        <span className="font-poster text-[44px] md:text-[64px] leading-[0.95] uppercase block font-black">
                            YOU&apos;VE FALLEN FOR,
                        </span>
                        <span className="font-poster text-[44px] md:text-[64px] leading-[0.95] uppercase block font-black text-cw-forest mt-1">
                            WATCHING ITSELF.
                        </span>
                    </h2>
                    <p className="font-body-serif text-[17px] leading-[1.6] text-cw-ink-soft max-w-[460px] m-0 mb-7">
                        Each row is a campground. Each bar is a single night, color-coded by how much
                        you&apos;d want it: dark green for the sites you&apos;ve starred, gold for
                        &ldquo;I&apos;d take it,&rdquo; dimmed for booked. The next eighteen weeks, at a
                        glance.
                    </p>
                    <div className="flex items-center gap-6">
                        {(
                            [
                                [C.forest, "favorite"],
                                [C.mustard, "acceptable"],
                                ["rgba(26,22,20,0.2)", "booked"],
                            ] as const
                        ).map(([color, label]) => (
                            <div key={label} className="flex items-center gap-2">
                                <span
                                    className="w-3 h-3 rounded-[2px] inline-block"
                                    style={{ background: color }}
                                />
                                <span className="font-italic-serif text-[17px] leading-none text-cw-ink-soft font-medium italic">
                                    {label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: the postcard */}
                <div className="relative" style={{ perspective: isMobile ? undefined : "1400px" }}>
                    <div
                        className="bg-cw-cream relative"
                        style={{
                            padding: isMobile ? 18 : "24px 26px 22px",
                            border: "1px solid rgba(26,22,20,0.14)",
                            boxShadow: isMobile
                                ? "0 14px 30px -12px rgba(26,22,20,0.3)"
                                : "0 30px 60px -20px rgba(26,22,20,0.35), 0 2px 0 rgba(26,22,20,0.05) inset",
                            transform: isMobile ? undefined : "rotate(-1.4deg)",
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
