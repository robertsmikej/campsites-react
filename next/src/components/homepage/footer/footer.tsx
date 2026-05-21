"use client";

import { C } from "@/components/field-notes/tokens";
import { HorizonSvg } from "./horizon-svg";
import { Wordmark } from "./wordmark";
import { ContactBlock } from "./contact-block";

export function Footer() {
    return (
        <footer
            className="relative overflow-hidden pt-12 pb-8 px-[22px] md:pt-16 md:pb-10 md:px-14 text-cw-cream"
            style={{ background: C.waterDeep }}
        >
            <HorizonSvg />
            <div className="relative mt-[60px] block md:flex md:justify-between md:items-end">
                <Wordmark />
                <ContactBlock />
            </div>
        </footer>
    );
}
