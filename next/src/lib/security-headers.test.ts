import { describe, it, expect } from "vitest";
import { applySecurityHeaders, httpsRedirectTarget, SECURITY_HEADERS } from "./security-headers";

describe("applySecurityHeaders", () => {
    it("sets every header on an empty Headers object", () => {
        const headers = applySecurityHeaders(new Headers());
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
            expect(headers.get(name)).toBe(value);
        }
    });

    it("does not overwrite a header the route already set", () => {
        const headers = new Headers({ "Referrer-Policy": "no-referrer" });
        applySecurityHeaders(headers);
        expect(headers.get("Referrer-Policy")).toBe("no-referrer");
        expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("ships HSTS for a year and forbids framing", () => {
        const headers = applySecurityHeaders(new Headers());
        expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
        expect(headers.get("X-Frame-Options")).toBe("DENY");
        expect(headers.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'none'");
    });
});

describe("httpsRedirectTarget", () => {
    it("upgrades a production http request and keeps path and query", () => {
        const target = httpsRedirectTarget(new URL("http://campwatch.dev/discover?x=1"), true);
        expect(target?.toString()).toBe("https://campwatch.dev/discover?x=1");
    });

    it("returns null for https requests", () => {
        expect(httpsRedirectTarget(new URL("https://campwatch.dev/"), true)).toBeNull();
    });

    it("returns null outside production so local http dev keeps working", () => {
        expect(httpsRedirectTarget(new URL("http://localhost:3000/"), false)).toBeNull();
    });
});
