import { describe, it, expect } from "vitest";
import { buildAuthorizationUrl, verifyIdToken } from "./google-oauth";

describe("buildAuthorizationUrl", () => {
    it("includes the required query params", () => {
        const url = new URL(
            buildAuthorizationUrl({
                clientId: "client.apps.googleusercontent.com",
                redirectUri: "https://example.com/auth/google/callback",
                state: "signed-state-value",
            }),
        );
        expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
        expect(url.searchParams.get("response_type")).toBe("code");
        expect(url.searchParams.get("client_id")).toBe("client.apps.googleusercontent.com");
        expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/auth/google/callback");
        expect(url.searchParams.get("state")).toBe("signed-state-value");
        expect(url.searchParams.get("scope")?.split(" ")).toEqual(
            expect.arrayContaining(["openid", "email", "profile"]),
        );
    });

    it("uses custom scopes when provided", () => {
        const url = new URL(
            buildAuthorizationUrl({
                clientId: "client.apps.googleusercontent.com",
                redirectUri: "https://example.com/auth/google/callback",
                state: "state",
                scopes: ["openid", "email"],
            }),
        );
        expect(url.searchParams.get("scope")).toBe("openid email");
    });

    it("sets access_type=online and prompt=select_account", () => {
        const url = new URL(
            buildAuthorizationUrl({
                clientId: "c",
                redirectUri: "https://example.com/callback",
                state: "s",
            }),
        );
        expect(url.searchParams.get("access_type")).toBe("online");
        expect(url.searchParams.get("prompt")).toBe("select_account");
    });
});

describe("verifyIdToken", () => {
    it("rejects a token that is not three dot-separated segments", async () => {
        await expect(verifyIdToken("not.a.token.actually", "aud")).rejects.toThrow();
        await expect(verifyIdToken("only.two", "aud")).rejects.toThrow();
    });

    it("rejects a token with an unparseable header", async () => {
        await expect(verifyIdToken("!!.payload.sig", "aud")).rejects.toThrow();
    });
});
