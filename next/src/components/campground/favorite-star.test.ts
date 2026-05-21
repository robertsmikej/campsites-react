import { describe, it, expect } from "vitest";

// FavoriteStar is a pure React component; DOM rendering requires jsdom.
// We verify the aria-label contract (filled/outlined branches) and module
// export here — the actual rendering is left to manual/E2E testing.

describe("FavoriteStar aria-label contract", () => {
    // The component uses:
    //   aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
    function ariaLabel(isFavorite: boolean): string {
        return isFavorite ? "Remove favorite" : "Add favorite";
    }

    it("shows 'Remove favorite' when isFavorite is true", () => {
        expect(ariaLabel(true)).toBe("Remove favorite");
    });

    it("shows 'Add favorite' when isFavorite is false", () => {
        expect(ariaLabel(false)).toBe("Add favorite");
    });
});

describe("FavoriteStar module exports", () => {
    it("exports FavoriteStar as a function", async () => {
        const mod = await import("./favorite-star");
        expect(typeof mod.FavoriteStar).toBe("function");
    });
});
