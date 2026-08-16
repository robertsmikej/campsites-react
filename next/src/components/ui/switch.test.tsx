import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Switch } from "./switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

afterEach(cleanup);

// Every style on the switch keys off the data-state Radix stamps on the root,
// and nothing about a wrong one shows up in the DOM: the control just renders
// as a bare thumb with no track and no travel, which is how the campground
// enable toggle sat invisible in the config dialog. jsdom/happy-dom don't run
// Tailwind, so the attribute is what these assert.

describe("Switch", () => {
    it("reflects checked state as data-state", () => {
        render(<Switch checked onCheckedChange={() => {}} aria-label="Watch" />);
        expect(screen.getByRole("switch").getAttribute("data-state")).toBe("checked");
    });

    it("reflects unchecked state as data-state", () => {
        render(<Switch checked={false} onCheckedChange={() => {}} aria-label="Watch" />);
        expect(screen.getByRole("switch").getAttribute("data-state")).toBe("unchecked");
    });

    it("keeps its own data-state when used as a tooltip trigger", () => {
        // TooltipTrigger asChild spreads the tooltip's own open/closed data-state
        // onto the child. Reaching the switch root, it replaces checked/unchecked
        // with "closed", which matches no style and paints nothing.
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
