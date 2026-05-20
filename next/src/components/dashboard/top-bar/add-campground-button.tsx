"use client";

import { CW } from "@/components/field-notes/cw-tokens";
import { FM } from "@/components/field-notes/tokens";

interface AddCampgroundButtonProps {
    onClick: () => void;
}

export function AddCampgroundButton({ onClick }: AddCampgroundButtonProps) {
    return (
        <button
            className="cw-tb-add"
            onClick={onClick}
            style={{
                font: `700 11px/1 ${FM}`, letterSpacing: "0.14em", textTransform: "uppercase",
                background: CW.ink, color: CW.cream, border: `1.5px solid ${CW.ink}`,
                padding: "8px 12px", cursor: "pointer", borderRadius: 2,
                display: "inline-flex", alignItems: "center", gap: 6,
                transition: "opacity .14s",
            }}
        >
            + Add campground
        </button>
    );
}
