import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Switch } from "./switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

afterEach(cleanup);

// The switch is styled entirely off the attribute Radix stamps on the root, so
// these guard the contract rather than the paint: jsdom/happy-dom don't run
// Tailwind, and a switch whose variants target an attribute nobody emits looks
// exactly like a working one in the DOM. It renders as a bare thumb on the page
// — no track, no travel — which is how the campground enable toggle sat
// invisible in the config dialog.

describe("Switch", () => {
    it("reflects checked state as data-state", () => {
        render(<Switch checked onCheckedChange={() => {}} aria-label="Watch" />);
        expect(screen.getByRole("switch").getAttribute("data-state")).toBe("checked");
    });

    it("reflects unchecked state as data-state", () => {
        render(<Switch checked={false} onCheckedChange={() => {}} aria-label="Watch" />);
        expect(screen.getByRole("switch").getAttribute("data-state")).toBe("unchecked");
    });

    it("styles the track and thumb off data-state, not a variant Radix never emits", () => {
        render(<Switch checked onCheckedChange={() => {}} aria-label="Watch" />);
        const root = screen.getByRole("switch");
        const thumb = root.querySelector('[data-slot="switch-thumb"]')!;
        const classes = `${root.className} ${thumb.className}`;

        expect(classes).toContain("data-[state=checked]:");
        expect(classes).toContain("data-[state=unchecked]:");
        // `data-checked:` / `data-unchecked:` compile to [data-checked] /
        // [data-unchecked]. Radix emits neither, so those rules are dead and the
        // control never picks up a background or moves its thumb.
        expect(classes).not.toMatch(/(?:^|[\s:])data-(?:un)?checked:/);
    });

    it("keeps its own data-state when used as a tooltip trigger", () => {
        // TooltipTrigger asChild spreads the tooltip's own data-state onto the
        // child, which lands on the switch root and clobbers Radix's.
        render(
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Switch checked onCheckedChange={() => {}} aria-label="Watch" />
                    </TooltipTrigger>
                    <TooltipContent>Watching</TooltipContent>
                </Tooltip>
            </TooltipProvider>,
        );
        expect(screen.getByRole("switch").getAttribute("data-state")).toBe("checked");
    });
});
