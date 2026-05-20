"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";
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
            style={{
                font: `700 10px/1 ${FM}`, letterSpacing: "0.12em", textTransform: "uppercase",
                background: isSnoozedNow ? CW.mustard : "transparent",
                color: isSnoozedNow ? CW.ink : CW.inkSubtle,
                border: `1px solid ${isSnoozedNow ? "transparent" : CW.rule}`,
                padding: "7px 9px", cursor: "pointer", borderRadius: 2,
                display: "inline-flex", alignItems: "center", gap: 5,
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
