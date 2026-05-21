"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { readStorage, formatSnoozeLabel } from "@/components/dashboard/helpers";

interface OpeningSnoozeButtonProps {
    itemId: string;
    onSnooze: (id: string) => void;
}

export function OpeningSnoozeButton({ itemId, onSnooze }: OpeningSnoozeButtonProps) {
    const snoozedUntil = readStorage<Record<string, string>>("campwatch:snoozed-openings", {});
    const isSnoozedNow = itemId in snoozedUntil;

    return (
        <button
            onClick={() => onSnooze(itemId)}
            className="font-mono-field text-[10px] font-bold leading-none tracking-[0.12em] uppercase px-[9px] py-[7px] cursor-pointer rounded-[2px] inline-flex items-center gap-[5px]"
            style={{
                background: isSnoozedNow ? CW.mustard : "transparent",
                color: isSnoozedNow ? CW.ink : CW.inkSubtle,
                border: `1px solid ${isSnoozedNow ? "transparent" : CW.rule}`,
            }}
        >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M6 3 V6 L8 7" /><circle cx="6" cy="6" r="4.5" />
            </svg>
            {isSnoozedNow
                ? formatSnoozeLabel(snoozedUntil[itemId])
                : "Snooze 1 month"}
        </button>
    );
}
