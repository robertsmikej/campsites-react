"use client";

import { DatePickerStrip } from "@/components/dashboard/date-picker-strip/date-picker-strip";
import { LoadingGhostRow } from "@/components/field-notes/loading";
import { AvailabilityTimeline } from "@/components/dashboard/timeline/availability-timeline";
import { MobileTimeline } from "@/components/dashboard/timeline/mobile-timeline";
import { CW } from "@/components/field-notes/cw-tokens";
import type { DateRange } from "react-day-picker";
import type { ProcessedCampground, GlobalSettings } from "@/types/campground";

export type GroupBy = "region" | "status" | "all";

interface WatchlistSectionProps {
    campgroundsByAreas: ProcessedCampground[];
    openCounts: Map<string, number>;
    isLoading: boolean;
    dateRange: { start: Date; end: Date };
    calRange: DateRange | undefined;
    datePickerOpen: boolean;
    setDatePickerOpen: (open: boolean) => void;
    handleCalSelect: (range: DateRange | undefined) => void;
    hasCustomRange?: boolean;
    onClearDates?: () => void;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    settings: { views?: { type?: "calendar" | "table" } };
    globalSettings?: GlobalSettings;
    isMobile: boolean;
    readOnly?: boolean;
    showControls?: boolean;
    onRatingChange?: (
        campgroundId: string,
        siteName: string,
        rating: "favorite" | "worthwhile" | "unrated",
    ) => void;
    onEditSettings?: (campgroundId: string) => void;
    onEditAll?: () => void;
    /** Discover/read-only: per-row "Add" link (signed-in → dashboard add dialog;
     *  logged-out → sign-in preserving the id). */
    addHref?: (campgroundId: string) => string;
    PAD: number;
}

function LegendSwatch({ kind }: { kind: "open" | "weekend" | "limited" | "booked" }) {
    const style: React.CSSProperties = { width: 22, height: 13, borderRadius: 3, display: "inline-block" };
    if (kind === "open") style.background = CW.forest;
    else if (kind === "weekend")
        style.background = `linear-gradient(90deg, ${CW.forest} 0 50%, ${CW.forestBright} 50% 100%)`;
    else if (kind === "limited")
        style.background = `repeating-linear-gradient(45deg, ${CW.mustard} 0 4px, color-mix(in srgb, ${CW.mustard} 32%, transparent) 4px 8px)`;
    else {
        style.background = CW.ruleSoft;
        style.border = `1px solid ${CW.rule}`;
    }
    return <span style={style} />;
}

export function WatchlistSection({
    campgroundsByAreas,
    isLoading,
    dateRange,
    calRange,
    datePickerOpen,
    setDatePickerOpen,
    handleCalSelect,
    hasCustomRange,
    onClearDates,
    isMobile,
    readOnly,
    showControls = true,
    onEditSettings,
    onEditAll,
    addHref,
    PAD,
}: WatchlistSectionProps) {
    // Campgrounds render in the saved Configure (drag) order — campgroundsByAreas
    // preserves the user's config order, so the dashboard matches Configure.
    return (
        <section
            className="relative border-t-[1.5px] border-cw-ink"
            // Trim the side padding so the timeline plate gets more width than the
            // rest of the dashboard (every pixel helps on the shared axis).
            style={{ padding: `24px ${Math.max(10, PAD - 12)}px 60px` }}
        >
            <div className="pt-7 mb-[18px] flex items-start justify-between gap-4">
                <div>
                    <div className="font-mono-field text-[13px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[10px] uppercase">
                        {readOnly
                            ? `The list · ${campgroundsByAreas.length} campground${campgroundsByAreas.length !== 1 ? "s" : ""}`
                            : `§ II — THE WATCHLIST · ${campgroundsByAreas.length} CAMPGROUND${campgroundsByAreas.length !== 1 ? "S" : ""}`}
                    </div>
                    <h2 className="m-0 tracking-[-0.005em]">
                        <span
                            className="font-poster font-black leading-none uppercase inline"
                            style={{ fontSize: isMobile ? 24 : 32 }}
                        >
                            {readOnly ? "ALL" : "EVERY PLACE"}
                        </span>
                        <span
                            className="font-italic-serif font-medium italic leading-none text-cw-forest tracking-[-0.01em]"
                            style={{ fontSize: isMobile ? 24 : 32, marginLeft: 10 }}
                        >
                            {readOnly ? "the picks." : "you're watching."}
                        </span>
                    </h2>
                </div>
                {!readOnly && onEditAll && (
                    <button
                        type="button"
                        onClick={onEditAll}
                        className="shrink-0 cursor-pointer whitespace-nowrap rounded-full font-mono-field font-semibold uppercase transition-colors hover:bg-[color-mix(in_srgb,var(--cw-forest)_8%,transparent)]"
                        style={{
                            fontSize: 11,
                            letterSpacing: "0.08em",
                            padding: "8px 14px",
                            color: CW.forest,
                            border: `1px solid ${CW.rule}`,
                        }}
                    >
                        Edit Campgrounds
                    </button>
                )}
            </div>

            {/* Timeline legend */}
            <div className="flex items-center flex-wrap gap-x-5 gap-y-2 mb-4 font-italic-serif italic text-[14px] text-cw-ink-soft">
                <span className="inline-flex items-center gap-2">
                    <LegendSwatch kind="open" />
                    Open
                </span>
                <span className="inline-flex items-center gap-2">
                    <LegendSwatch kind="weekend" />
                    Weekend (Fri/Sat)
                </span>
                <span className="inline-flex items-center gap-2">
                    <LegendSwatch kind="limited" />
                    Limited (1–2 sites)
                </span>
                <span className="inline-flex items-center gap-2">
                    <LegendSwatch kind="booked" />
                    Booked
                </span>
                <span className="inline-flex items-center gap-3 font-mono-field not-italic text-[11px] tracking-[0.12em] uppercase text-cw-ink-subtle">
                    <span>Per-site:</span>
                    <span style={{ color: CW.clay }}>★ favorite</span>
                    <span style={{ color: CW.forest }}>◇ worthwhile</span>
                    <span style={{ color: CW.inkFaint }}>· other</span>
                </span>
            </div>

            {showControls && (
                <DatePickerStrip
                    dateRange={dateRange}
                    calRange={calRange}
                    datePickerOpen={datePickerOpen}
                    setDatePickerOpen={setDatePickerOpen}
                    handleCalSelect={handleCalSelect}
                    isMobile={isMobile}
                    hasCustomRange={hasCustomRange}
                    onClearDates={onClearDates}
                />
            )}

            {isLoading && campgroundsByAreas.length === 0 ? (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <LoadingGhostRow key={i} height={56} />
                    ))}
                </div>
            ) : isMobile ? (
                <MobileTimeline
                    rows={campgroundsByAreas}
                    dateRange={dateRange}
                    onEditSettings={onEditSettings}
                    addHref={addHref}
                />
            ) : (
                <AvailabilityTimeline
                    rows={campgroundsByAreas}
                    dateRange={dateRange}
                    defaultExpandFirst
                    onEditSettings={onEditSettings}
                    addHref={addHref}
                />
            )}
        </section>
    );
}
