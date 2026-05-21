"use client";

import { C } from "@/components/field-notes/tokens";
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
}

export function LetterCard({ auth }: LetterCardProps) {
    return (
        <div className="relative">
            <div
                className="bg-cw-cream border-[1.5px] border-cw-ink relative md:rotate-[1.8deg]"
                style={{
                    padding: undefined,
                    boxShadow: `6px 6px 0 ${C.forest}`,
                }}
            >
                <div className="p-5 md:p-7 md:px-8">
                    {/* Washi tape */}
                    <div
                        className="absolute top-[-10px] left-1/2 -translate-x-1/2 -rotate-[3deg] w-[110px] h-[22px]"
                        style={{
                            background: "rgba(201,162,39,0.35)",
                            border: "1px solid rgba(201,162,39,0.55)",
                        }}
                    />

                    {/* Envelope-style header */}
                    <div className="border-b border-cw-rule pb-[14px] mb-4 flex justify-between items-start">
                        <div className="font-mono-field text-[11px] leading-[1.6] text-cw-ink-soft tracking-[0.06em] font-medium">
                            <div className="text-cw-ink-soft">FROM</div>
                            <div className="text-cw-ink mt-[2px]">CampWatch &lt;alerts@campwatch.dev&gt;</div>
                            <div className="text-cw-ink-soft mt-2">TO</div>
                            <div className="text-cw-ink mt-[2px]">
                                {auth.user?.email ?? "you@trail.example"}
                            </div>
                        </div>
                        <div className="font-mono-field text-[10px] leading-[1.5] text-cw-ink-soft tracking-[0.1em] text-right font-medium">
                            <div>05.20.MMXXVI</div>
                            <div>07:14 MDT</div>
                        </div>
                    </div>

                    <div className="font-poster text-[26px] leading-[1.1] uppercase mb-1 font-black">
                        <span className="text-cw-clay">2 OPENINGS</span> — OUTLET, PINE FLATS
                    </div>
                    <p className="font-italic-serif text-[18px] leading-[1.4] text-cw-ink-soft m-0 mb-4 font-medium italic">
                        Hello — two new openings this morning. Both match your window.
                    </p>

                    {LETTER_ROWS.map((e) => (
                        <LetterRow key={e.name} name={e.name} date={e.date} tag={e.tag} />
                    ))}

                    <div className="border-t border-dashed border-cw-rule mt-2 pt-[14px] font-italic-serif text-[14px] leading-[1.5] text-cw-ink-soft italic">
                        Yours from the trail,
                        <br />
                        <span className="font-hand text-[22px] leading-none text-cw-clay font-semibold not-italic">
                            — CampWatch
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
