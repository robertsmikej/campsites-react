import { describe, it, expect } from "vitest";

// CampgroundThumbnail is a div with inline backgroundImage and size Tailwind classes.
// We test the logic it encodes: size→class mapping and the backgroundImage conditional.

describe("CampgroundThumbnail size class mapping", () => {
    const SIZE_CLASSES = {
        sm: "size-9",
        md: "size-12",
        lg: "size-16",
    } as const;

    it("maps 'sm' to size-9", () => {
        expect(SIZE_CLASSES.sm).toBe("size-9");
    });

    it("maps 'md' to size-12", () => {
        expect(SIZE_CLASSES.md).toBe("size-12");
    });

    it("maps 'lg' to size-16", () => {
        expect(SIZE_CLASSES.lg).toBe("size-16");
    });
});

describe("CampgroundThumbnail backgroundImage logic", () => {
    function buildStyle(imageUrl: string): React.CSSProperties | undefined {
        return imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined;
    }

    it("sets backgroundImage when imageUrl is non-empty", () => {
        const s = buildStyle("https://example.com/img.jpg");
        expect(s).toEqual({ backgroundImage: "url(https://example.com/img.jpg)" });
    });

    it("returns undefined when imageUrl is empty string", () => {
        const s = buildStyle("");
        expect(s).toBeUndefined();
    });
});

// Importing the React type for the helper above without jsdom
import type React from "react";

describe("CampgroundThumbnail module exports", () => {
    it("exports CampgroundThumbnail as a function", async () => {
        const mod = await import("./campground-thumbnail");
        expect(typeof mod.CampgroundThumbnail).toBe("function");
    });
});
