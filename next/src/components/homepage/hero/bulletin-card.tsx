"use client";

import { C } from "@/components/field-notes/tokens";
import { DCompass, DPostmark } from "@/components/field-notes/decorations";
import { formatTimeAgo } from "@/components/field-notes/format-time-ago";

interface BulletinCardProps {
    lastPollAt: string | undefined;
    nowMs: number;
}

export function BulletinCard({ lastPollAt, nowMs }: BulletinCardProps) {
    return (
        <div className="relative">
            <div
                className="bg-cw-cream p-5 border-[1.5px] border-cw-ink rotate-[1.6deg]"
                style={{ boxShadow: `8px 8px 0 ${C.forest}, 0 30px 60px -20px rgba(0,0,0,0.4)` }}
            >
                <div className="flex justify-between items-start mb-[10px]">
                    <div>
                        <div className="font-mono-field text-[10px] leading-none tracking-[0.18em] text-cw-clay font-medium">
                            FIELD STATION
                        </div>
                        <div className="font-poster text-[24px] leading-none mt-[6px] uppercase font-black">
                            Sawtooth NRA
                        </div>
                        <div className="font-italic-serif text-[14px] leading-[1.3] mt-1 text-cw-ink-soft font-medium italic">
                            Stanley · Custer Co., Idaho
                        </div>
                    </div>
                    <DCompass size={44} color={C.forest} />
                </div>
                <div className="my-3 h-px bg-cw-rule" />
                <div className="grid grid-cols-2 gap-y-2 font-mono-field text-[10px] leading-none tracking-[0.14em] text-cw-ink-soft font-medium">
                    <span>ELEV</span>
                    <span className="text-right text-cw-ink">6,512 FT</span>
                    <span>SITES</span>
                    <span className="text-right text-cw-ink">38</span>
                    <span>OPEN</span>
                    <span className="text-right text-cw-forest font-poster text-[14px] font-black">
                        3 NIGHTS
                    </span>
                    <span>LAST POLL</span>
                    <span className="text-right text-cw-clay">
                        {lastPollAt ? formatTimeAgo(nowMs - new Date(lastPollAt).getTime()) : "—"}
                    </span>
                </div>
                <div className="mt-3 mb-[6px] h-px bg-cw-rule-soft" />
                <div className="font-italic-serif text-[14px] leading-[1.4] text-cw-clay font-semibold italic">
                    a quiet, perfect spot — N.L.
                </div>
            </div>
            <div className="absolute bottom-[-28px] left-[-34px] -rotate-[14deg]">
                <DPostmark />
            </div>
        </div>
    );
}
