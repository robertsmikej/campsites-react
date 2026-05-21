import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ContactBlock contains two links:
//   1. mailto:hello@campwatch.dev
//   2. https://github.com/robertsmikej/campsites-react  rel="noopener noreferrer"
// We verify those constants here by reading the source directly (no DOM needed).

const SOURCE = readFileSync(
    resolve(__dirname, "contact-block.tsx"),
    "utf8",
);

describe("ContactBlock link constants", () => {
    it("mailto href points to hello@campwatch.dev", () => {
        expect(SOURCE).toContain("mailto:hello@campwatch.dev");
    });

    it("GitHub link is rel='noopener noreferrer'", () => {
        expect(SOURCE).toContain("noopener noreferrer");
    });

    it("GitHub URL points to the correct repo", () => {
        expect(SOURCE).toContain("https://github.com/robertsmikej/campsites-react");
    });
});

describe("ContactBlock module exports", () => {
    it("exports ContactBlock as a function", async () => {
        const mod = await import("./contact-block");
        expect(typeof mod.ContactBlock).toBe("function");
    });
});
