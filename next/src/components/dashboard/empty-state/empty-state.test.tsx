import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// Mock the heavy sub-components that pull in hooks + fetch calls
vi.mock("@/components/campground-lookup", () => ({
    CampgroundLookup: () => <div data-testid="campground-lookup" />,
}));

vi.mock("@/components/ui/dialog", () => ({
    Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { EmptyState } from "./empty-state";

describe("EmptyState — render", () => {
    it("renders the welcome headline", () => {
        render(<EmptyState onClone={vi.fn().mockResolvedValue(undefined)} />);
        expect(screen.getByText(/your watchlist/i)).toBeInTheDocument();
    });

    it("renders the 'Use the curator's picks' borrow button", () => {
        render(<EmptyState onClone={vi.fn().mockResolvedValue(undefined)} />);
        expect(screen.getByRole("button", { name: /use the curator's picks/i })).toBeInTheDocument();
    });
});

describe("EmptyState — borrow button click", () => {
    it("calls onClone when the borrow button is clicked", async () => {
        const user = userEvent.setup();
        const onClone = vi.fn().mockResolvedValue(undefined);
        render(<EmptyState onClone={onClone} />);
        await user.click(screen.getByRole("button", { name: /use the curator's picks/i }));
        expect(onClone).toHaveBeenCalledOnce();
    });

    it("shows 'Loading…' while the clone is in progress", async () => {
        const user = userEvent.setup();
        // onClone resolves after the test checks the loading state
        let resolveClone!: () => void;
        const onClone = vi.fn().mockReturnValue(
            new Promise<void>((res) => {
                resolveClone = res;
            }),
        );
        render(<EmptyState onClone={onClone} />);
        await user.click(screen.getByRole("button", { name: /use the curator's picks/i }));
        expect(screen.getByRole("button", { name: /loading/i })).toBeInTheDocument();
        resolveClone();
    });
});
