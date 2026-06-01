"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

// Forward props + ref so this can be used as a child of a Radix `<PopoverTrigger asChild>`
// (or any other primitive that clones its child and injects handlers).
export const PickDatesButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
    function PickDatesButton(props, ref) {
        return (
            <button
                ref={ref}
                type="button"
                {...props}
                className="font-mono-field text-[12px] md:text-[13px] font-bold leading-none tracking-[0.12em] uppercase bg-transparent text-cw-ink border border-cw-rule px-[10px] py-2 md:px-3 md:py-[9px] cursor-pointer rounded-[2px] inline-flex items-center gap-2"
            >
                <svg
                    width="13"
                    height="13"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                >
                    <rect x="1.5" y="3" width="11" height="10" rx="1" />
                    <path d="M1.5 6 H12.5" />
                    <path d="M4 1.5 V4 M10 1.5 V4" />
                </svg>
                Pick dates →
            </button>
        );
    },
);
