"use client";

import { C } from "@/components/field-notes/tokens";

export function HorizonSvg() {
    return (
        <svg viewBox="0 0 1600 80" preserveAspectRatio="none" className="absolute top-0 left-0 w-full h-20">
            <path
                d="M 0 80 L 100 50 L 200 70 L 320 30 L 440 60 L 580 20 L 720 50 L 860 25 L 1000 60 L 1140 35 L 1280 65 L 1420 40 L 1600 60 L 1600 80 Z"
                fill={C.forestNear}
            />
        </svg>
    );
}
