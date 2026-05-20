"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CampgroundLookup } from "@/components/campground-lookup";
import { CW } from "@/components/field-notes/cw-tokens";
import { FH, FI, FB, FM } from "@/components/field-notes/tokens";

interface EmptyStateProps {
    onClone: () => Promise<void>;
    isMobile: boolean;
}

export function EmptyState({ onClone, isMobile }: EmptyStateProps) {
    const [showLookup, setShowLookup] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleClone = async () => {
        setBusy(true);
        try { await onClone(); } finally { setBusy(false); }
    };

    const pad = isMobile ? 22 : 36;

    return (
        <>
            <section style={{ padding: `64px ${pad}px`, maxWidth: 960 }}>
                <div style={{ font: `500 11px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 14, textTransform: "uppercase" }}>
                    Welcome aboard.
                </div>
                <h1 style={{ margin: "0 0 18px", letterSpacing: "-0.005em" }}>
                    <span style={{ font: `900 ${isMobile ? 38 : 56}px/0.95 ${FH}`, textTransform: "uppercase", display: "block" }}>
                        YOUR WATCHLIST
                    </span>
                    <span style={{ font: `500 italic ${isMobile ? 38 : 56}px/0.95 ${FI}`, color: CW.forest, display: "block", marginTop: 4, letterSpacing: "-0.01em" }}>
                        is empty — for now.
                    </span>
                </h1>
                <p style={{ font: `400 18px/1.55 ${FB}`, color: CW.inkSoft, margin: "0 0 40px", maxWidth: 640 }}>
                    Add a campground from <em>recreation.gov</em> and we&apos;ll start polling every five minutes. When a site you&apos;d actually take opens up, an email finds you. That&apos;s the whole thing.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18, marginBottom: 32 }}>
                    {/* Path A — Paste a URL */}
                    <article style={{ background: CW.cream, border: `1.5px solid ${CW.ink}`, boxShadow: `6px 6px 0 ${CW.forest}`, padding: "24px 26px" }}>
                        <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                            Option 01
                        </div>
                        <h2 style={{ margin: "0 0 14px" }}>
                            <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>PASTE A URL</span>
                            <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from recreation.gov.</span>
                        </h2>
                        <button
                            onClick={() => setShowLookup(true)}
                            style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: CW.forest, color: CW.cream, border: "none", padding: "13px 16px", cursor: "pointer", borderRadius: 2 }}
                        >
                            Look up a campground →
                        </button>
                    </article>

                    {/* Path B — Borrow a list */}
                    <article style={{ background: CW.cream, border: `1px solid ${CW.rule}`, padding: "24px 26px" }}>
                        <div style={{ font: `700 10px/1 ${FM}`, letterSpacing: "0.18em", color: CW.clay, marginBottom: 10, textTransform: "uppercase" }}>
                            Option 02
                        </div>
                        <h2 style={{ margin: "0 0 14px" }}>
                            <span style={{ font: `900 22px/1.1 ${FH}`, textTransform: "uppercase", display: "block" }}>BORROW A LIST</span>
                            <span style={{ font: `500 italic 22px/1.1 ${FI}`, color: CW.forest, display: "block", marginTop: 2 }}>from the curator.</span>
                        </h2>
                        <p style={{ font: `400 14px/1.5 ${FB}`, color: CW.inkSoft, margin: "0 0 14px" }}>
                            Start with <strong style={{ color: CW.ink }}>hand-picked campgrounds</strong> across Sawtooth, Glacier, Yosemite, and Olympic. Edit or remove any of them later.
                        </p>
                        <button
                            onClick={() => void handleClone()}
                            disabled={busy}
                            style={{ font: `800 12px/1 ${FH}`, letterSpacing: "0.14em", textTransform: "uppercase", background: "transparent", color: CW.ink, border: `1.5px solid ${CW.ink}`, padding: "12px 16px", cursor: busy ? "not-allowed" : "pointer", borderRadius: 2, opacity: busy ? 0.6 : 1 }}
                        >
                            {busy ? "Loading…" : "Use the curator's picks"}
                        </button>
                    </article>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, font: `500 italic 15px/1.4 ${FI}`, color: CW.inkSubtle }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: CW.mustard, flexShrink: 0 }} />
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
