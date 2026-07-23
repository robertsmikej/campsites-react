import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl, TierChip } from "./field-primitives";

describe("SegmentedControl", () => {
    const OPTIONS = [
        { value: "favorites", label: "Favorites only" },
        { value: "worthwhile", label: "Favorites + Worthwhile" },
        { value: "all", label: "Any site opens" },
    ];

    it("renders all options and marks the active one", () => {
        render(<SegmentedControl options={OPTIONS} value="worthwhile" onChange={() => {}} />);
        const active = screen.getByRole("button", { name: "Favorites + Worthwhile" });
        expect(active.getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("button", { name: "Any site opens" }).getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("fires onChange with the clicked value", () => {
        const onChange = vi.fn();
        render(<SegmentedControl options={OPTIONS} value="favorites" onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Any site opens" }));
        expect(onChange).toHaveBeenCalledWith("all");
    });

    it("renders a disabled option that does not fire onChange", () => {
        const onChange = vi.fn();
        render(
            <SegmentedControl
                options={[
                    { value: "high", label: "Every minute", disabled: true },
                    { value: "normal", label: "Every 5 min" },
                ]}
                value="normal"
                onChange={onChange}
            />,
        );
        const disabledBtn = screen.getByRole("button", { name: "Every minute" });
        expect((disabledBtn as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(disabledBtn);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("SegmentedControl buttons are standalone pills on mobile and joined at sm", () => {
        const { getAllByRole, container } = render(
            <SegmentedControl
                options={[
                    { value: "a", label: "Alpha" },
                    { value: "b", label: "Beta" },
                ]}
                value="a"
                onChange={() => {}}
            />,
        );
        const group = container.firstElementChild as HTMLElement;
        expect(group.className).toContain("flex-wrap");
        expect(group.className).toContain("sm:flex-nowrap");
        const buttons = getAllByRole("button");
        for (const b of buttons) {
            expect(b.className).toContain("border-[1.5px]");
            expect(b.className).toContain("sm:border-0");
        }
    });
});

describe("TierChip", () => {
    it("renders the favorite star and count", () => {
        render(<TierChip tier="fav" count={2} />);
        expect(screen.getByText("★ 2")).toBeTruthy();
    });
    it("renders the worthwhile diamond and count", () => {
        render(<TierChip tier="worth" count={1} />);
        expect(screen.getByText("◇ 1")).toBeTruthy();
    });
});
