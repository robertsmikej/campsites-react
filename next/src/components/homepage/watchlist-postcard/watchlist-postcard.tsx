"use client";

import { useEffect, useState } from "react";
import { C } from "@/components/field-notes/tokens";
import { DTopo } from "@/components/field-notes/decorations";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useStats } from "@/contexts/stats-context";
import { PostcardHeader } from "./postcard-header";
import { PostcardRow } from "./postcard-row";
import { PostcardFooter } from "./postcard-footer";
import { PostcardDecorations } from "./postcard-decorations";
import type { Campground, ApiConfigResponse } from "@/types/campground";

interface PostcardDisplayRow {
    name: string;
    loc: string;
    pattern: string;
    tag: string;
    tagColor: string;
}

interface RecentOpening {
    campgroundId: string;
    campgroundName: string;
    from: string;
    to: string;
    nights: number;
}

// Fallback used during initial render and if either API call returns empty.
// These four are real campgrounds from the curator's default list — so the
// section never looks broken if KV hasn't been populated yet.
const FALLBACK_ROWS: PostcardDisplayRow[] = [
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
];

const PATTERN_LEN = 25;

function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildPattern(openings: RecentOpening[]): string {
    // Anchor the 25-day window at the earliest opening date so the bars are
    // dense; if there are no openings, return all dots (caller handles that).
    if (openings.length === 0) return ".".repeat(PATTERN_LEN);
    const earliest = openings.reduce((min, o) => (o.from < min ? o.from : min), openings[0]!.from);
    const start = new Date(`${earliest}T00:00:00`);
    const days: string[] = [];
    for (let i = 0; i < PATTERN_LEN; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const iso = toIso(d);
        const hit = openings.some((o) => iso >= o.from && iso < o.to);
        days.push(hit ? "g" : ".");
    }
    return days.join("");
}

function buildDisplayRows(defaults: Campground[], recent: RecentOpening[]): PostcardDisplayRow[] {
    // Group openings by campground id.
    const byId = new Map<string, RecentOpening[]>();
    for (const o of recent) {
        const list = byId.get(o.campgroundId) ?? [];
        list.push(o);
        byId.set(o.campgroundId, list);
    }

    // Prefer campgrounds with activity, then fill from the rest of the default
    // list so we always have 4 rows.
    const withActivity = defaults.filter((c) => (byId.get(c.id)?.length ?? 0) > 0);
    const withoutActivity = defaults.filter((c) => (byId.get(c.id)?.length ?? 0) === 0);
    const picked = [...withActivity, ...withoutActivity].slice(0, 4);
    if (picked.length < 4) return [];

    return picked.map((cg) => {
        const openings = byId.get(cg.id) ?? [];
        if (openings.length === 0) {
            return {
                name: cg.name,
                loc: cg.area ?? "",
                pattern: ".".repeat(PATTERN_LEN),
                tag: "watching",
                tagColor: "rgba(26,22,20,0.5)",
            };
        }
        return {
            name: cg.name,
            loc: cg.area ?? "",
            pattern: buildPattern(openings),
            tag: `${openings.length} open`,
            tagColor: C.forest,
        };
    });
}

export function WatchlistPostcard() {
    const isMobile = useIsMobile();
    const { stats, nowMs } = useStats();
    const [rows, setRows] = useState<PostcardDisplayRow[]>(FALLBACK_ROWS);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [defResp, recResp] = await Promise.all([
                    fetch("/api/default"),
                    fetch("/api/openings/recent"),
                ]);
                if (!defResp.ok || !recResp.ok) return;
                const defBody = (await defResp.json()) as ApiConfigResponse;
                const recent = (await recResp.json()) as RecentOpening[];
                const defaults = defBody.campgrounds?.["recreation.gov"] ?? [];
                if (defaults.length < 4) return;
                const built = buildDisplayRows(defaults, recent);
                if (!cancelled && built.length === 4) setRows(built);
            } catch {
                // Keep the fallback rows on any error.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

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

                        {rows.map((row, i) => (
                            <PostcardRow
                                key={row.name}
                                name={row.name}
                                loc={row.loc}
                                pattern={row.pattern}
                                tag={row.tag}
                                tagColor={row.tagColor}
                                isLast={i === rows.length - 1}
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
