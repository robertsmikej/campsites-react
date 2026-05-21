"use client";

interface BorrowListCardProps {
    onClone: () => Promise<void>;
    busy: boolean;
}

export function BorrowListCard({ onClone, busy }: BorrowListCardProps) {
    return (
        <article className="bg-cw-cream border border-cw-rule p-[24px_26px]">
            <div className="font-mono-field text-[10px] font-bold leading-none tracking-[0.18em] text-cw-clay mb-[10px] uppercase">
                Option 02
            </div>
            <h2 className="m-0 mb-[14px]">
                <span className="font-poster text-[22px] font-black leading-[1.1] uppercase block">BORROW A LIST</span>
                <span className="font-italic-serif text-[22px] font-medium italic leading-[1.1] text-cw-forest block mt-[2px]">from the curator.</span>
            </h2>
            <p className="font-body-serif text-[14px] leading-[1.5] text-cw-ink-soft m-0 mb-[14px]">
                Start with <strong className="text-cw-ink">hand-picked campgrounds</strong> across Sawtooth, Glacier, Yosemite, and Olympic. Edit or remove any of them later.
            </p>
            <button
                onClick={() => void onClone()}
                disabled={busy}
                className="font-poster text-[12px] font-black leading-none tracking-[0.14em] uppercase bg-transparent text-cw-ink border-[1.5px] border-cw-ink px-4 py-3 rounded-[2px]"
                style={{ cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
                {busy ? "Loading…" : "Use the curator's picks"}
            </button>
        </article>
    );
}
