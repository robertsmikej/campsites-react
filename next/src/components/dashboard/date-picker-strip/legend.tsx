"use client";

export function Legend() {
    return (
        <div className="ml-auto flex gap-[14px] items-center font-italic-serif text-[13px] italic leading-none text-cw-ink-soft">
            <span className="inline-flex items-center gap-[5px]">
                <span className="w-2 h-2 bg-cw-forest rounded-[2px]" />open
            </span>
            <span className="inline-flex items-center gap-[5px]">
                <span className="w-2 h-2 bg-cw-ink-faint rounded-[2px]" />booked
            </span>
        </div>
    );
}
