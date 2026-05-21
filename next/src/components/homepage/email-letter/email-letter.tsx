"use client";

import { Intro } from "./intro";
import { LetterCard } from "./letter-card";
import type { AuthState } from "@/hooks/use-auth";

interface EmailLetterProps {
    auth: AuthState;
}

export function EmailLetter({ auth }: EmailLetterProps) {
    return (
        <section className="relative py-[60px] px-[22px] md:pt-24 md:pb-20 md:px-14">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7 md:gap-[72px] items-center">
                <Intro />
                <LetterCard auth={auth} />
            </div>
        </section>
    );
}
