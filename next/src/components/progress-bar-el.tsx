"use client";

import { useProgressBar } from "@/context/progress-bar";

export function ProgressBarEl() {
    const progress = useProgressBar();
    if (!progress || progress.progress >= 1) return null;
    const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="sticky top-0 z-50 h-1 w-full bg-muted"
        >
            <div
                className="h-full bg-emerald-600 transition-all duration-200 ease-out"
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}
