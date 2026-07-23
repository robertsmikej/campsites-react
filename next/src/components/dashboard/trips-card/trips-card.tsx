"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarDays, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toLocalIso } from "@/components/dashboard/helpers";
import {
    diffDays,
    windowIsPast,
    TRIP_MAX_FLEX_DAYS,
    TRIP_MAX_LABEL,
    TRIP_MAX_WINDOWS,
    type TripSiteHit,
} from "@/lib/trip-windows";
import type { Campground, ProcessedCampground, TripWindow } from "@/types/campground";

interface TripsCardProps {
    tripWindows: TripWindow[];
    /** Watched campgrounds, for the optional per-window filter. */
    campgrounds: Campground[];
    /** Live availability (server-computed tripMatches ride on these). */
    campgroundsByAreas: ProcessedCampground[];
    onChange: (next: TripWindow[]) => void;
    isMobile: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtIso = (iso: string) => DATE_FMT.format(new Date(iso + "T00:00:00"));

/** Fri->Sun of this (or next) weekend, arrival clamped to today. Exported for tests. */
export function weekendWindow(offsetWeeks: 0 | 1, now: Date = new Date()): { from: string; to: string } {
    const dow = now.getDay();
    // Anchor on the weekend's Friday: Fri = today, Sat = yesterday, else the coming Friday.
    const delta = dow === 5 ? 0 : dow === 6 ? -1 : 5 - dow;
    const friday = new Date(now);
    friday.setDate(now.getDate() + delta + offsetWeeks * 7);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    const todayIso = toLocalIso(now);
    const fromIso = toLocalIso(friday);
    return { from: fromIso < todayIso ? todayIso : fromIso, to: toLocalIso(sunday) };
}

const reservationLink = (h: TripSiteHit) =>
    `https://www.recreation.gov/camping/campsites/${h.siteId}?arrivalDate=${h.run.from}&departureDate=${h.run.to}`;

export function TripsCard({
    tripWindows,
    campgrounds,
    campgroundsByAreas,
    onChange,
    isMobile,
}: TripsCardProps) {
    const [adding, setAdding] = useState(false);
    const [range, setRange] = useState<DateRange | undefined>();
    const [label, setLabel] = useState("");
    const [flex, setFlex] = useState(0);
    const [cgFilter, setCgFilter] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const todayIso = toLocalIso(new Date());

    const hitsByWindow = useMemo(() => {
        const map = new Map<string, TripSiteHit[]>();
        for (const cg of campgroundsByAreas) {
            for (const h of cg.tripMatches ?? []) {
                const list = map.get(h.windowId);
                if (list) list.push(h);
                else map.set(h.windowId, [h]);
            }
        }
        return map;
    }, [campgroundsByAreas]);

    const rangeValid = Boolean(range?.from && range?.to && toLocalIso(range.from) < toLocalIso(range.to));
    const nights = rangeValid ? diffDays(toLocalIso(range!.from!), toLocalIso(range!.to!)) : 0;
    const maxFlex = rangeValid ? Math.min(TRIP_MAX_FLEX_DAYS, Math.floor((nights - 1) / 2)) : 0;

    const resetForm = () => {
        setAdding(false);
        setRange(undefined);
        setLabel("");
        setFlex(0);
        setCgFilter(new Set());
    };

    const commitAdd = () => {
        if (!rangeValid || tripWindows.length >= TRIP_MAX_WINDOWS) return;
        const w: TripWindow = {
            id: crypto.randomUUID(),
            from: toLocalIso(range!.from!),
            to: toLocalIso(range!.to!),
            ...(label.trim() ? { label: label.trim().slice(0, TRIP_MAX_LABEL) } : {}),
            ...(flex > 0 ? { flexDays: Math.min(flex, maxFlex) } : {}),
            ...(cgFilter.size > 0 ? { campgroundIds: [...cgFilter] } : {}),
        };
        onChange([...tripWindows, w]);
        resetForm();
    };

    const quickAdd = (offset: 0 | 1) => {
        if (tripWindows.length >= TRIP_MAX_WINDOWS) return;
        const { from, to } = weekendWindow(offset);
        if (tripWindows.some((w) => w.from === from && w.to === to)) return;
        onChange([
            ...tripWindows,
            { id: crypto.randomUUID(), from, to, label: offset === 0 ? "This weekend" : "Next weekend" },
        ]);
    };

    const remove = (id: string) => onChange(tripWindows.filter((w) => w.id !== id));

    const toggleExpanded = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const atCap = tripWindows.length >= TRIP_MAX_WINDOWS;

    return (
        <section className="px-[22px] py-3 md:px-9">
            <div className="rounded-lg border border-cw-rule bg-cw-cream/40 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <CalendarDays className="size-4 shrink-0 text-cw-clay" aria-hidden />
                    <h2 className="font-poster text-[15px] font-extrabold uppercase tracking-[0.08em]">
                        Trips
                    </h2>
                    <span className="font-italic-serif text-[13px] italic text-cw-ink-soft">
                        dates you&rsquo;re hunting for
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="outline" disabled={atCap} onClick={() => quickAdd(0)}>
                            This weekend
                        </Button>
                        <Button size="sm" variant="outline" disabled={atCap} onClick={() => quickAdd(1)}>
                            Next weekend
                        </Button>
                        <Button size="sm" disabled={atCap} onClick={() => setAdding((v) => !v)}>
                            <Plus className="size-4" /> Add dates
                        </Button>
                    </div>
                </div>

                {adding && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-cw-rule-soft pt-3">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {rangeValid
                                        ? `${fmtIso(toLocalIso(range!.from!))} → ${fmtIso(toLocalIso(range!.to!))}`
                                        : "Arrival → departure"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="range"
                                    resetOnSelect
                                    selected={range}
                                    onSelect={setRange}
                                    numberOfMonths={isMobile ? 1 : 2}
                                />
                            </PopoverContent>
                        </Popover>
                        <label className="flex flex-col gap-1 font-mono-field text-[11px] uppercase tracking-[0.1em] text-cw-ink-soft">
                            Label
                            <input
                                className="rounded border border-cw-rule bg-white px-2 py-1 font-body-serif text-sm normal-case tracking-normal"
                                value={label}
                                maxLength={TRIP_MAX_LABEL}
                                placeholder="Lake weekend"
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </label>
                        <label className="flex flex-col gap-1 font-mono-field text-[11px] uppercase tracking-[0.1em] text-cw-ink-soft">
                            Flex ±days
                            <select
                                className="rounded border border-cw-rule bg-white px-2 py-1 text-sm"
                                value={Math.min(flex, maxFlex)}
                                onChange={(e) => setFlex(Number(e.target.value))}
                                disabled={maxFlex === 0}
                            >
                                {Array.from({ length: maxFlex + 1 }, (_, i) => (
                                    <option key={i} value={i}>
                                        ±{i}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {campgrounds.length > 0 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        {cgFilter.size === 0
                                            ? "All campgrounds"
                                            : `${cgFilter.size} campground${cgFilter.size === 1 ? "" : "s"}`}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="max-h-64 w-64 overflow-y-auto p-2" align="start">
                                    {campgrounds.map((cg) => (
                                        <label key={cg.id} className="flex items-center gap-2 py-1 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={cgFilter.has(cg.id)}
                                                onChange={(e) =>
                                                    setCgFilter((prev) => {
                                                        const next = new Set(prev);
                                                        if (e.target.checked) next.add(cg.id);
                                                        else next.delete(cg.id);
                                                        return next;
                                                    })
                                                }
                                            />
                                            <span className="min-w-0 truncate">{cg.name}</span>
                                        </label>
                                    ))}
                                </PopoverContent>
                            </Popover>
                        )}
                        <div className="flex gap-2">
                            <Button size="sm" disabled={!rangeValid || atCap} onClick={commitAdd}>
                                Save trip
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetForm}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {tripWindows.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-2">
                        {tripWindows.map((w) => {
                            const hits = hitsByWindow.get(w.id) ?? [];
                            const past = windowIsPast(w, todayIso);
                            const isOpen = expanded.has(w.id);
                            return (
                                <li
                                    key={w.id}
                                    className={`rounded border border-cw-rule bg-white/60 px-3 py-2 ${past ? "opacity-50" : ""}`}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-body-serif text-sm font-bold">
                                            {w.label ?? `${fmtIso(w.from)} → ${fmtIso(w.to)}`}
                                        </span>
                                        <span className="font-mono-field text-[12px] text-cw-ink-soft">
                                            {fmtIso(w.from)} → {fmtIso(w.to)}
                                            {w.flexDays ? ` · ±${w.flexDays}d` : ""}
                                            {w.campgroundIds?.length
                                                ? ` · ${w.campgroundIds.length} campground${w.campgroundIds.length === 1 ? "" : "s"}`
                                                : ""}
                                        </span>
                                        {past ? (
                                            <span className="font-mono-field text-[11px] uppercase text-cw-ink-faint">
                                                Past
                                            </span>
                                        ) : hits.length > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(w.id)}
                                                className="flex cursor-pointer items-center gap-1 rounded bg-cw-forest px-2 py-0.5 font-mono-field text-[11px] font-bold uppercase tracking-[0.08em] text-cw-cream"
                                            >
                                                {hits.length} site{hits.length === 1 ? "" : "s"} match
                                                {hits.length === 1 ? "es" : ""} now
                                                {isOpen ? (
                                                    <ChevronUp className="size-3" />
                                                ) : (
                                                    <ChevronDown className="size-3" />
                                                )}
                                            </button>
                                        ) : (
                                            <span className="font-mono-field text-[11px] uppercase text-cw-ink-faint">
                                                Watching
                                            </span>
                                        )}
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="ml-auto"
                                            aria-label="Remove trip"
                                            onClick={() => remove(w.id)}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                    </div>
                                    {isOpen && hits.length > 0 && (
                                        <ul className="mt-2 flex flex-col gap-1 border-t border-cw-rule-soft pt-2">
                                            {hits.map((h) => (
                                                <li
                                                    key={`${h.campgroundId}:${h.siteId}`}
                                                    className="flex flex-wrap items-center gap-2 text-sm"
                                                >
                                                    <span>
                                                        {h.tier === "favorites"
                                                            ? "★ "
                                                            : h.tier === "worthwhile"
                                                              ? "◇ "
                                                              : ""}
                                                        {h.campgroundName} · {h.siteName}
                                                    </span>
                                                    <span className="font-mono-field text-[12px] text-cw-ink-soft">
                                                        {fmtIso(h.run.from)} → {fmtIso(h.run.to)} ·{" "}
                                                        {h.run.nights}n
                                                    </span>
                                                    <a
                                                        className="ml-auto font-mono-field text-[12px] font-bold uppercase text-cw-forest underline"
                                                        href={reservationLink(h)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Book →
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
