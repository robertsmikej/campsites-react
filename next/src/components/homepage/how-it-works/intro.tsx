"use client";

export function Intro() {
    return (
        <div>
            <div className="font-mono-field text-[11px] leading-none tracking-[0.18em] text-cw-clay mb-[10px] font-medium uppercase">
                METHOD
            </div>
            <h2 className="m-0 tracking-[-0.005em]">
                <span className="font-poster text-[44px] md:text-[56px] leading-[0.95] uppercase block font-black">
                    THREE SMALL THINGS,
                </span>
                <span className="font-italic-serif text-[34px] md:text-[44px] leading-none text-cw-forest block mt-1 tracking-[-0.01em] font-medium italic">
                    then a quiet inbox.
                </span>
            </h2>
            <p className="font-italic-serif text-[15px] leading-[1.5] text-cw-ink-soft mt-5 md:max-w-[240px] italic">
                Set it up once, in about a minute. Ignore us forever until summer.
            </p>
        </div>
    );
}
