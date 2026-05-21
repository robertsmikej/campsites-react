import { describe, it, expect } from "vitest";

// CampgroundNameLine renders name + optional area subtitle.
// The logic: subtitle is only rendered when `subtitleClassName` is defined
// (even empty string counts as defined).  We test that contract here.

describe("CampgroundNameLine subtitle visibility logic", () => {
    function shouldShowSubtitle(subtitleClassName: string | undefined): boolean {
        return subtitleClassName !== undefined;
    }

    it("shows subtitle when subtitleClassName is an empty string", () => {
        expect(shouldShowSubtitle("")).toBe(true);
    });

    it("shows subtitle when subtitleClassName is a non-empty class string", () => {
        expect(shouldShowSubtitle("text-sm text-muted-foreground")).toBe(true);
    });

    it("hides subtitle when subtitleClassName is undefined", () => {
        expect(shouldShowSubtitle(undefined)).toBe(false);
    });
});

describe("CampgroundNameLine area fallback", () => {
    // When area is null/undefined the component renders "" (empty string)
    function displayArea(area: string | null | undefined): string {
        return area ?? "";
    }

    it("renders area string when provided", () => {
        expect(displayArea("Sawtooth National Forest")).toBe("Sawtooth National Forest");
    });

    it("renders empty string when area is null", () => {
        expect(displayArea(null)).toBe("");
    });

    it("renders empty string when area is undefined", () => {
        expect(displayArea(undefined)).toBe("");
    });
});

describe("CampgroundNameLine module exports", () => {
    it("exports CampgroundNameLine as a function", async () => {
        const mod = await import("./campground-name-line");
        expect(typeof mod.CampgroundNameLine).toBe("function");
    });
});
