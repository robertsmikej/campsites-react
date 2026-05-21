import { describe, it, expect } from "vitest";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "./hmac";

const SECRET = "test-secret-do-not-use-in-prod";

describe("HMAC unsubscribe tokens", () => {
    it("generates a stable hex token for a given email + secret", async () => {
        const a = await generateUnsubscribeToken("user@example.com", SECRET);
        const b = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    it("verifies a correct token", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(await verifyUnsubscribeToken("user@example.com", token, SECRET)).toBe(true);
    });

    it("rejects a token for a different email", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(await verifyUnsubscribeToken("other@example.com", token, SECRET)).toBe(false);
    });

    it("rejects a token signed with a different secret", async () => {
        const token = await generateUnsubscribeToken("user@example.com", SECRET);
        expect(await verifyUnsubscribeToken("user@example.com", token, "different-secret")).toBe(false);
    });

    it("rejects garbage tokens without throwing", async () => {
        expect(await verifyUnsubscribeToken("user@example.com", "deadbeef", SECRET)).toBe(false);
        expect(await verifyUnsubscribeToken("user@example.com", "", SECRET)).toBe(false);
    });
});
