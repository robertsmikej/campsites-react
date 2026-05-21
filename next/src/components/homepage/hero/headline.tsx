"use client";

export function Headline() {
    return (
        <h1 className="mb-[18px] md:mb-[26px] text-cw-cream [text-shadow:0_1px_30px_rgba(0,0,0,0.25)] m-0">
            <span className="font-poster text-[58px] md:text-[124px] leading-[0.86] tracking-[-0.01em] uppercase block font-black">
                NEVER MISS
            </span>
            <span className="font-poster text-[58px] md:text-[124px] leading-[0.86] tracking-[-0.01em] uppercase block font-black">
                A <span className="text-[#f6c79c]">CAMPSITE,</span>
            </span>
            <span className="font-italic-serif text-[38px] md:text-[88px] leading-none tracking-[-0.015em] block mt-1 font-medium italic">
                by the lake or otherwise.
            </span>
        </h1>
    );
}
