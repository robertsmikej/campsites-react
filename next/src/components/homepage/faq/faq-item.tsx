"use client";

import React from "react";

interface FaqItemProps {
    q: string;
    a: React.ReactNode;
    index: number;
    isMobile: boolean;
}

export function FaqItem({ q, a, index, isMobile }: FaqItemProps) {
    if (isMobile) {
        return (
            <details
                className="cw-faq py-[14px] border-b border-[rgba(239,230,210,0.18)]"
                style={{ borderTop: index === 0 ? "1px solid rgba(239,230,210,0.18)" : "none" }}
            >
                <summary className="flex justify-between items-start gap-[14px] cursor-pointer">
                    <div className="flex items-start gap-[10px]">
                        <span className="font-mono-field text-[12px] leading-[1.6] text-cw-mustard tracking-[0.12em] flex-shrink-0 font-medium">
                            Q.0{index + 1}
                        </span>
                        <h3 className="font-italic-serif text-[19px] leading-[1.3] text-cw-cream m-0 tracking-[-0.005em] font-medium italic">
                            {q}
                        </h3>
                    </div>
                    <span className="font-mono-field text-[20px] leading-none text-cw-mustard flex-shrink-0 font-medium">
                        +
                    </span>
                </summary>
                <p className="font-body-serif text-[14px] leading-[1.55] text-[rgba(239,230,210,0.82)] m-0 mt-3 ml-[26px]">
                    {a}
                </p>
            </details>
        );
    }

    return (
        <div
            className="py-[18px] border-b border-[rgba(239,230,210,0.2)]"
            style={{ borderTop: index === 0 ? "1px solid rgba(239,230,210,0.2)" : "none" }}
        >
            <div className="grid grid-cols-[48px_1fr] gap-4">
                <span className="font-mono-field text-[13px] leading-none text-cw-mustard tracking-[0.12em] pt-[6px] font-medium">
                    Q.0{index + 1}
                </span>
                <div>
                    <h3 className="m-0 mb-[10px] tracking-[-0.005em]">
                        <span className="font-italic-serif text-[24px] leading-[1.2] text-cw-cream font-medium italic">
                            {q}
                        </span>
                    </h3>
                    <p className="font-body-serif text-[15px] leading-[1.55] text-[rgba(239,230,210,0.82)] m-0 max-w-[640px]">
                        {a}
                    </p>
                </div>
            </div>
        </div>
    );
}
