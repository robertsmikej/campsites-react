"use client";

interface AddCampgroundButtonProps {
    onClick: () => void;
}

export function AddCampgroundButton({ onClick }: AddCampgroundButtonProps) {
    return (
        <button
            className="cw-tb-add font-mono-field text-[11px] font-bold leading-none tracking-[0.14em] uppercase bg-cw-ink text-cw-cream border-[1.5px] border-cw-ink px-3 py-2 cursor-pointer rounded-[2px] inline-flex items-center gap-[6px] transition-opacity duration-[140ms]"
            onClick={onClick}
        >
            + Add campground
        </button>
    );
}
