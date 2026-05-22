"use client";

interface GroupHeaderProps {
    index: number;
    label: string;
    count: number;
    openInGroup: number;
}

export function GroupHeader({ index, label, count, openInGroup }: GroupHeaderProps) {
    return (
        <div className="flex items-baseline gap-3 mb-[10px]">
            <span className="font-mono-field text-[13px] font-bold leading-none tracking-[0.18em] text-cw-clay uppercase">
                {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-italic-serif text-[22px] font-medium italic leading-none text-cw-ink tracking-[-0.005em]">
                {label}
            </span>
            <span className="font-mono-field text-[13px] font-medium leading-none text-cw-ink-subtle tracking-[0.08em]">
                · {count} campground{count !== 1 ? "s" : ""}
            </span>
            {openInGroup > 0 && (
                <span className="font-mono-field text-[13px] font-bold leading-none text-cw-forest tracking-[0.12em] uppercase">
                    · {openInGroup} open
                </span>
            )}
            <div className="flex-1 h-px bg-cw-rule" />
        </div>
    );
}
