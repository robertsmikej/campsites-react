"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface OnboardingModalProps {
    open: boolean;
    onClone: () => Promise<void>;
    onStartBlank: () => Promise<void>;
    curatorDisplayName?: string;
}

export function OnboardingModal({
    open,
    onClone,
    onStartBlank,
    curatorDisplayName,
}: OnboardingModalProps) {
    const [busy, setBusy] = useState(false);

    const cloneLabel = `Clone ${curatorDisplayName ?? "the default"} list`;

    async function handleClone() {
        setBusy(true);
        try {
            await onClone();
        } finally {
            setBusy(false);
        }
    }

    async function handleBlank() {
        setBusy(true);
        try {
            await onStartBlank();
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open}>
            <DialogContent
                className="sm:max-w-lg"
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Welcome to CampWatch</DialogTitle>
                    <DialogDescription>
                        Pick a starting point for your watchlist. You can change anything later in
                        Configure Sites.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                    <Button variant="outline" onClick={handleBlank} disabled={busy}>
                        Start blank
                    </Button>
                    <Button onClick={handleClone} disabled={busy}>
                        {cloneLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
