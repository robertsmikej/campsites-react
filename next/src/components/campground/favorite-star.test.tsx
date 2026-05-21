import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FavoriteStar } from "./favorite-star";

describe("FavoriteStar — aria-label", () => {
    it("shows 'Remove favorite' aria-label when isFavorite=true", () => {
        render(<FavoriteStar isFavorite={true} />);
        expect(screen.getByRole("button", { name: "Remove favorite" })).toBeInTheDocument();
    });

    it("shows 'Add favorite' aria-label when isFavorite=false", () => {
        render(<FavoriteStar isFavorite={false} />);
        expect(screen.getByRole("button", { name: "Add favorite" })).toBeInTheDocument();
    });
});

describe("FavoriteStar — click handler", () => {
    it("calls onToggle when the button is clicked", async () => {
        const user = userEvent.setup();
        const handler = vi.fn();
        render(<FavoriteStar isFavorite={false} onToggle={handler} />);
        await user.click(screen.getByRole("button", { name: "Add favorite" }));
        expect(handler).toHaveBeenCalledOnce();
    });

    it("does not throw when onToggle is omitted and the button is clicked", async () => {
        const user = userEvent.setup();
        render(<FavoriteStar isFavorite={false} />);
        // Should not throw
        await user.click(screen.getByRole("button", { name: "Add favorite" }));
    });
});

describe("FavoriteStar — hidden prop", () => {
    it("renders nothing when hidden=true", () => {
        const { container } = render(<FavoriteStar isFavorite={false} hidden={true} />);
        expect(container.firstChild).toBeNull();
    });
});
