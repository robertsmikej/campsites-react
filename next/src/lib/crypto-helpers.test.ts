import { describe, it, expect } from "vitest";
import { generateOpaqueToken, signValue, verifySignedValue } from "./crypto-helpers";

describe("generateOpaqueToken", () => {
    it("returns a 64-char hex string by default", () => {
        const t = generateOpaqueToken();
        expect(t).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different tokens on repeated calls", () => {
        expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
    });

    it("respects custom byte length", () => {
        expect(generateOpaqueToken(16)).toMatch(/^[a-f0-9]{32}$/);
    });
});

describe("signValue / verifySignedValue", () => {
    const SECRET = "test-secret";

    it("round-trips a value", async () => {
        const signed = await signValue("hello-world", SECRET);
        expect(await verifySignedValue(signed, SECRET)).toBe("hello-world");
    });

    it("rejects values signed with a different secret", async () => {
        const signed = await signValue("hello", SECRET);
        expect(await verifySignedValue(signed, "other")).toBeNull();
    });

    it("rejects tampered payloads", async () => {
        const signed = await signValue("hello", SECRET);
        const tampered = signed.replace(/.$/, signed.endsWith("a") ? "b" : "a");
        expect(await verifySignedValue(tampered, SECRET)).toBeNull();
    });

    it("rejects malformed input without throwing", async () => {
        expect(await verifySignedValue("no-dot", SECRET)).toBeNull();
        expect(await verifySignedValue("", SECRET)).toBeNull();
    });
});
