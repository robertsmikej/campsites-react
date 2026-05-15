import { describe, it, expect } from "vitest";
import { isValidEmail, normalizeEmail } from "./email";

describe("isValidEmail", () => {
    it.each([
        ["user@example.com", true],
        ["a@b.co", true],
        ["", false],
        ["nope", false],
        ["nope@", false],
        ["@nope.com", false],
        ["with space@bad.com", false],
    ])("isValidEmail(%j) → %s", (input, expected) => {
        expect(isValidEmail(input)).toBe(expected);
    });
});

describe("normalizeEmail", () => {
    it("trims and lowercases", () => {
        expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    });

    it("returns empty string when given undefined or non-string", () => {
        expect(normalizeEmail(undefined)).toBe("");
        expect(normalizeEmail(null as unknown as string)).toBe("");
    });
});
