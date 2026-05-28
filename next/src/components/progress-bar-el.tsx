"use client";

import { useProgressBar } from "@/context/progress-bar";

export function ProgressBarEl() {
    const progress = useProgressBar();
    if (!progress || progress.progress >= 1) return null;

    // Determinate progress (when totalCalls > 1 and currentCall is tracked).
    // With the current backend-driven hook this never happens, but keep the
    // path for future use if granular progress is ever re-introduced.
    const hasDeterminate = progress.totalCalls > 1 && progress.currentCall > 0;
    const percent = hasDeterminate
        ? Math.max(0, Math.min(100, Math.round(progress.progress * 100)))
        : null;

    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            {...(percent !== null ? { "aria-valuenow": percent } : {})}
            aria-label="Loading availability"
            className="sticky top-0 z-50 h-1.5 w-full overflow-hidden bg-cw-rule-soft"
        >
            <style>{`
                @keyframes cw-progress-indeterminate {
                    0%   { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                }
            `}</style>
            {percent !== null ? (
                <div
                    className="h-full bg-cw-forest transition-all duration-200 ease-out"
                    style={{ width: `${percent}%` }}
                />
            ) : (
                <div
                    className="h-full w-1/4 bg-cw-forest"
                    style={{
                        animation: "cw-progress-indeterminate 1.1s ease-in-out infinite",
                    }}
                />
            )}
        </div>
    );
}
