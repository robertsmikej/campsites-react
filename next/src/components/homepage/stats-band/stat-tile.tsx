"use client";

interface StatTileProps {
    label: string;
    value: string;
    color: string;
    sub: string;
}

export function StatTile({ label, value, color, sub }: StatTileProps) {
    return (
        <div>
            <div className="font-mono-field text-[13px] leading-none tracking-[0.16em] text-[rgba(251,246,234,0.55)] uppercase font-medium">
                {label}
            </div>
            <div className="flex items-baseline gap-[10px] mt-2">
                <span
                    className="font-poster text-[32px] md:text-[36px] leading-none font-black [font-variant-numeric:tabular-nums]"
                    style={{ color }}
                >
                    {value}
                </span>
                <span className="font-italic-serif text-[14px] leading-none text-[rgba(251,246,234,0.55)] font-medium italic">
                    {sub}
                </span>
            </div>
        </div>
    );
}
