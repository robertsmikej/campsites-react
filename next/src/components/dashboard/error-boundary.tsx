"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    section: string; // e.g. "Openings feed"
    children: ReactNode;
}

interface State {
    error: Error | null;
}

export class DashboardErrorBoundary extends Component<Props, State> {
    override state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(`[DashboardErrorBoundary:${this.props.section}]`, error, info);
    }

    override render() {
        if (this.state.error) {
            return (
                <div className="my-4 rounded-lg border border-cw-rule bg-cw-cream px-4 py-3 text-sm">
                    <div className="font-mono-field text-[12px] font-bold uppercase tracking-[0.18em] text-cw-clay">
                        {this.props.section} · couldn&apos;t load
                    </div>
                    <div className="mt-1 font-body-serif text-[14px] italic text-cw-ink-soft">
                        Something&apos;s off on our end. Refresh the page to try again.
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
