"use client";

import { DStamp } from "@/components/field-notes/decorations";

export function PostcardHeader() {
    return (
        <div className="flex justify-between items-start border-b border-dashed border-[rgba(26,22,20,0.18)] pb-[14px] mb-4 gap-4">
            <div>
                <div className="font-mono-field text-[10px] leading-none tracking-[0.24em] uppercase text-cw-clay font-bold">
                    Your Watchlist · Spring &apos;26
                </div>
                <div className="font-italic-serif text-[24px] leading-none text-cw-ink mt-2 font-medium italic">
                    4 campgrounds · 18 weeks ahead
                </div>
            </div>
            <DStamp />
        </div>
    );
}
