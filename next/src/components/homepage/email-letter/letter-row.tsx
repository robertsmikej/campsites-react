"use client";

export function LetterRow({ name, date, tag }: { name: string; date: string; tag: string }) {
    return (
        <div className="py-3 border-t border-dashed border-cw-rule">
            <div className="flex justify-between items-baseline">
                <div className="font-body-serif text-[16px] leading-[1.2] font-semibold">{name}</div>
                <span className="font-mono-field text-[9px] leading-none tracking-[0.16em] text-cw-clay border border-cw-clay py-[3px] px-[6px] font-bold">
                    {tag}
                </span>
            </div>
            <div className="font-italic-serif text-[14px] leading-[1.4] text-cw-ink-soft mt-1 font-medium italic">
                {date}
            </div>
            <a className="font-body-serif text-[13px] leading-none text-cw-forest underline mt-[6px] inline-block font-semibold">
                Book on recreation.gov →
            </a>
        </div>
    );
}
