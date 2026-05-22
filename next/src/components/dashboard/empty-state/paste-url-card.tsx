"use client";

import { CW } from "@/components/field-notes/cw-tokens";

interface PasteUrlCardProps {
    onShowLookup: () => void;
}

export function PasteUrlCard({ onShowLookup }: PasteUrlCardProps) {
    return (
        <article
            className="bg-cw-cream border-[1.5px] border-cw-ink p-[24px_26px]"
            style={{ boxShadow: `6px 6px 0 ${CW.forest}` }}
        >
            <div className="font-mono-field text-[12px] font-bold leading-none tracking-[0.18em] text-cw-clay mb-[10px] uppercase">
                Option 01
            </div>
            <h2 className="m-0 mb-[14px]">
                <span className="font-poster text-[22px] font-black leading-[1.1] uppercase block">
                    PASTE A URL
                </span>
                <span className="font-italic-serif text-[22px] font-medium italic leading-[1.1] text-cw-forest block mt-[2px]">
                    from recreation.gov.
                </span>
            </h2>
            <button
                onClick={onShowLookup}
                className="font-poster text-[12px] font-black leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream border-none px-4 py-[13px] cursor-pointer rounded-[2px]"
            >
                Look up a campground →
            </button>
        </article>
    );
}
