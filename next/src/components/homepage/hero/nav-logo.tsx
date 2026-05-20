"use client";

import { C } from "@/components/field-notes/tokens";

export function NavLogo() {
    return (
        <div className="flex items-center gap-3">
            <svg viewBox="0 0 32 32" width="28" height="28">
                <path d="M16 4 L4 28 L28 28 Z" fill="none" stroke={C.cream} strokeWidth="2" />
                <path d="M16 12 L10 28 L22 28 Z" fill={C.cream} />
            </svg>
            <span className="font-poster text-[19px] leading-none tracking-[0.04em] uppercase text-cw-cream font-black">
                CampWatch
            </span>
        </div>
    );
}
