"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CampgroundLookup } from "@/components/campground-lookup";
import { PasteUrlCard } from "./paste-url-card";
import { BorrowListCard } from "./borrow-list-card";

interface EmptyStateProps {
    onClone: () => Promise<void>;
}

export function EmptyState({ onClone }: EmptyStateProps) {
    const [showLookup, setShowLookup] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleClone = async () => {
        setBusy(true);
        try { await onClone(); } finally { setBusy(false); }
    };

    return (
        <>
            <section className="px-[22px] md:px-9 py-16 max-w-[960px]">
                <div className="font-mono-field text-[11px] font-medium leading-none tracking-[0.18em] text-cw-clay mb-[14px] uppercase">
                    Welcome aboard.
                </div>
                <h1 className="m-0 mb-[18px] tracking-[-0.005em]">
                    <span className="font-poster text-[38px] md:text-[56px] font-black leading-[0.95] uppercase block">
                        YOUR WATCHLIST
                    </span>
                    <span className="font-italic-serif text-[38px] md:text-[56px] font-medium italic leading-[0.95] text-cw-forest block mt-1 tracking-[-0.01em]">
                        is empty — for now.
                    </span>
                </h1>
                <p className="font-body-serif text-[18px] leading-[1.55] text-cw-ink-soft m-0 mb-10 max-w-[640px]">
                    Add a campground from <em>recreation.gov</em> and we&apos;ll start polling every five minutes. When a site you&apos;d actually take opens up, an email finds you. That&apos;s the whole thing.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] mb-8">
                    <PasteUrlCard onShowLookup={() => setShowLookup(true)} />
                    <BorrowListCard onClone={handleClone} busy={busy} />
                </div>

                <div className="flex items-center gap-[10px] font-italic-serif text-[15px] font-medium italic leading-[1.4] text-cw-ink-subtle">
                    <span className="w-2 h-2 rounded-full bg-cw-mustard shrink-0" />
                    Polling won&apos;t start until you add at least one campground. We&apos;ll never email an empty watchlist.
                </div>
            </section>

            {/* Lookup modal */}
            <Dialog open={showLookup} onOpenChange={setShowLookup}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle className="font-display">Add a campground</DialogTitle>
                    </DialogHeader>
                    <div className="px-2 pb-4">
                        <CampgroundLookup variant="dashboard" />
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
