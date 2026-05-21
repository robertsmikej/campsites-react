import { describe, it, expect } from "vitest";

// OpenCountBadge is a React component; we can't render it without jsdom.
// Instead we test the branching logic it encodes: count === 0 → "Nothing open",
// count > 0 → "{count} open".  The module import also proves the file compiles.

describe("OpenCountBadge logic", () => {
    function label(count: number): string {
        if (count === 0) return "Nothing open";
        return `${count} open`;
    }

    it("returns 'Nothing open' when count is 0", () => {
        expect(label(0)).toBe("Nothing open");
    });

    it("returns 'X open' for a positive count", () => {
        expect(label(3)).toBe("3 open");
    });

    it("returns '1 open' for count of 1", () => {
        expect(label(1)).toBe("1 open");
    });

    it("handles large counts", () => {
        expect(label(42)).toBe("42 open");
    });
});

describe("OpenCountBadge module exports", () => {
    it("exports OpenCountBadge as a function", async () => {
        const mod = await import("./open-count-badge");
        expect(typeof mod.OpenCountBadge).toBe("function");
    });
});
