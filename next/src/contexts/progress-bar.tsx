"use client";

import { createContext, useContext } from "react";

export interface ProgressBarValue {
    totalCalls: number;
    currentCall: number;
    progress: number;
}

const ProgressBarContext = createContext<ProgressBarValue | null>(null);

export function useProgressBar(): ProgressBarValue | null {
    return useContext(ProgressBarContext);
}

export default ProgressBarContext;
