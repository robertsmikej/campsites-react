"use client";

import { C } from "@/components/field-notes/tokens";

type StepIcon = "pin" | "cal" | "mail";

interface StepColumnProps {
    rn: string;
    num: string;
    t: string;
    d: string;
    ic: StepIcon;
}

export function StepColumn({ rn, num, t, d, ic }: StepColumnProps) {
    return (
        <div className="border-t-2 border-cw-ink pt-[18px]">
            <div className="flex justify-between items-baseline mb-[14px]">
                <div className="flex items-baseline gap-3">
                    <span className="font-poster text-[38px] leading-none text-cw-forest font-black">{num}</span>
                    <span className="font-italic-serif text-[28px] leading-none text-cw-clay font-medium italic">{rn}</span>
                </div>
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    stroke={C.ink}
                    strokeWidth="1.6"
                    fill="none"
                >
                    {ic === "pin" && (
                        <>
                            <path d="M16 5 C11 5 7 9 7 14 C7 21 16 28 16 28 C16 28 25 21 25 14 C25 9 21 5 16 5 Z" />
                            <circle cx="16" cy="14" r="3.5" />
                        </>
                    )}
                    {ic === "cal" && (
                        <>
                            <rect x="5" y="7" width="22" height="20" rx="1" />
                            <line x1="5" y1="12" x2="27" y2="12" />
                            <line x1="10" y1="4" x2="10" y2="10" />
                            <line x1="22" y1="4" x2="22" y2="10" />
                        </>
                    )}
                    {ic === "mail" && (
                        <>
                            <rect x="4" y="7" width="24" height="18" rx="1" />
                            <path d="M4 8 L16 18 L28 8" />
                        </>
                    )}
                </svg>
            </div>
            <h3 className="m-0 mb-[10px] font-poster text-[22px] leading-[1.15] uppercase font-black">
                {t}
            </h3>
            <p className="font-body-serif text-[14px] leading-[1.55] text-cw-ink-soft m-0">{d}</p>
        </div>
    );
}
