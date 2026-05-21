"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampgroundLookup } from "@/components/campground-lookup";

export function AddCampgroundDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="font-display">Add a campground</DialogTitle>
                </DialogHeader>
                <div className="px-2 pb-4">
                    <CampgroundLookup variant="dashboard" />
                </div>
            </DialogContent>
        </Dialog>
    );
}
