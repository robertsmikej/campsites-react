import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildVerificationToken, sendVerificationEmail } from "./verification-email";
import { verifySignedValue } from "./crypto-helpers";

const SECRET = "test-secret";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("buildVerificationToken", () => {
    it("round-trips account|address through signValue/verifySignedValue", async () => {
        const token = await buildVerificationToken("me@gmail.com", "me@icloud.com", SECRET);
        expect(await verifySignedValue(token, SECRET)).toBe("me@gmail.com|me@icloud.com");
    });

    it("a tampered token fails verification", async () => {
        const token = await buildVerificationToken("me@gmail.com", "me@icloud.com", SECRET);
        expect(await verifySignedValue(token + "0", SECRET)).toBeNull();
        expect(await verifySignedValue(token, "other-secret")).toBeNull();
    });
});

describe("sendVerificationEmail", () => {
    beforeEach(() => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    });

    it("POSTs to Resend addressed to the NEW address with a working verify link", async () => {
        await sendVerificationEmail({
            accountEmail: "me@gmail.com",
            newAddress: "me@icloud.com",
            origin: "https://campwatch.dev",
            resendApiKey: "re_test",
            apiSecret: SECRET,
        });

        const calls = vi.mocked(globalThis.fetch).mock.calls;
        expect(calls).toHaveLength(1);
        const [url, init] = calls[0]!;
        expect(String(url)).toBe("https://api.resend.com/emails");
        const body = JSON.parse(String(init?.body)) as { to: string; html: string; subject: string };
        expect(body.to).toBe("me@icloud.com");
        expect(body.subject.toLowerCase()).toContain("confirm");

        const m = body.html.match(/verify-notification-email\?token=([A-Za-z0-9_\-.%]+)/);
        expect(m).toBeTruthy();
        const token = decodeURIComponent(m![1]!);
        expect(await verifySignedValue(token, SECRET)).toBe("me@gmail.com|me@icloud.com");
    });

    it("escapes HTML-meaningful characters in the account email", async () => {
        await sendVerificationEmail({
            accountEmail: '"<b>x</b>"@gmail.com',
            newAddress: "me@icloud.com",
            origin: "https://campwatch.dev",
            resendApiKey: "re_test",
            apiSecret: SECRET,
        });
        const body = JSON.parse(String(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body)) as {
            html: string;
        };
        expect(body.html).not.toContain("<b>x</b>");
        expect(body.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    });

    it("throws when Resend responds non-2xx", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response("nope", { status: 500 }));
        await expect(
            sendVerificationEmail({
                accountEmail: "me@gmail.com",
                newAddress: "me@icloud.com",
                origin: "https://campwatch.dev",
                resendApiKey: "re_test",
                apiSecret: SECRET,
            }),
        ).rejects.toThrow();
    });
});
