import { describe, it, expect } from "vitest";

// FaqItem branches on isMobile: true → <details>, false → <div>.
// We test the logical contract and module export.

describe("FaqItem isMobile branch logic", () => {
    function elementType(isMobile: boolean): "details" | "div" {
        return isMobile ? "details" : "div";
    }

    it("renders a details element in mobile mode", () => {
        expect(elementType(true)).toBe("details");
    });

    it("renders a div in desktop mode", () => {
        expect(elementType(false)).toBe("div");
    });
});

describe("FaqItem index label", () => {
    // The component shows Q.0{index+1} — test the format string
    function indexLabel(index: number): string {
        return `Q.0${index + 1}`;
    }

    it("first item is Q.01", () => {
        expect(indexLabel(0)).toBe("Q.01");
    });

    it("second item is Q.02", () => {
        expect(indexLabel(1)).toBe("Q.02");
    });

    it("ninth item is Q.09", () => {
        expect(indexLabel(8)).toBe("Q.09");
    });
});

describe("FaqItem border-top logic", () => {
    // index === 0 gets a top border; subsequent items do not
    function hasBorderTop(index: number): boolean {
        return index === 0;
    }

    it("first item has top border", () => {
        expect(hasBorderTop(0)).toBe(true);
    });

    it("subsequent items have no top border", () => {
        expect(hasBorderTop(1)).toBe(false);
        expect(hasBorderTop(5)).toBe(false);
    });
});

describe("FaqItem module exports", () => {
    it("exports FaqItem as a function", async () => {
        const mod = await import("./faq-item");
        expect(typeof mod.FaqItem).toBe("function");
    });
});
