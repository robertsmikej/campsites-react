"use client";

import { C } from "@/components/field-notes/tokens";
import { DBadge } from "@/components/field-notes/decorations";

export function Intro() {
    return (
        <div>
            <div className="font-mono-field text-[11px] leading-none tracking-[0.18em] text-cw-clay mb-[10px] font-medium uppercase">
                DISPATCH
            </div>
            <h2 className="m-0 mb-6 tracking-[-0.005em]">
                <span className="font-poster text-[44px] md:text-[56px] leading-[0.95] uppercase block font-black">
                    THE WHOLE PRODUCT
                </span>
                <span className="font-italic-serif text-[38px] md:text-[56px] leading-none text-cw-forest block mt-1 tracking-[-0.01em] font-medium italic">
                    fits in an email.
                </span>
            </h2>
            <p className="font-body-serif text-[17px] leading-[1.6] text-cw-ink-soft max-w-[460px] m-0 mb-6">
                No app to open. No notifications to manage. One short, well-written note when a site
                you&apos;d actually take opens up — direct link, two-sentence body, one-click unsubscribe.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
                <DBadge color={C.forest}>Direct Booking Link</DBadge>
                <DBadge color={C.forest}>One-click Unsubscribe</DBadge>
                <DBadge color={C.forest}>Plain Text · No Tracking</DBadge>
            </div>
            <div className="font-hand text-[22px] leading-[1.3] text-cw-clay mt-7 font-semibold italic">
                &ldquo;faster than your refresh tab.&rdquo;
            </div>
        </div>
    );
}
