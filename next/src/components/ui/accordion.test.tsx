import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

afterEach(cleanup);

describe("AccordionContent", () => {
    it("does not pin the content wrapper to the open-time measured height", () => {
        // Radix sets --radix-accordion-content-height ONCE when the item opens; it
        // never re-measures. A static h-(--radix-accordion-content-height) on the
        // inner wrapper therefore freezes the section at its open-time height and
        // overflow-hidden clips anything added afterward (bit us with dynamically
        // added blackout-date rows). The var belongs to the open/close keyframes
        // on the Content element only.
        const { container } = render(
            <Accordion type="single" defaultValue="a">
                <AccordionItem value="a">
                    <AccordionTrigger>Section</AccordionTrigger>
                    <AccordionContent>
                        <div>row</div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>,
        );
        const wrapper = container.querySelector('[data-slot="accordion-content"] > div');
        expect(wrapper).toBeTruthy();
        expect(wrapper!.className).not.toContain("h-(--radix-accordion-content-height)");
    });
});
