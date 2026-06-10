// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "@/lib/__mocks__/cloudflare-test-helpers";

vi.mock("@/lib/cloudflare", () => ({
    getEnv: vi.fn(),
    getKv: vi.fn(),
}));

import * as cloudflare from "@/lib/cloudflare";
import { signValue } from "@/lib/crypto-helpers";

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(cloudflare.getEnv).mockReturnValue({ API_SECRET: "test-secret" } as never);
});

const PROFILE_KEY = "user:me@gmail.com:profile";

function seedProfile(extra: Record<string, unknown> = {}) {
    return createMockKv({
        [PROFILE_KEY]: JSON.stringify({
            email: "me@gmail.com",
            name: "Mike",
            roles: [],
            createdAt: "x",
            pendingNotificationEmail: "me@icloud.com",
            ...extra,
        }),
    });
}

async function doVerify(token: string | null): Promise<Response> {
    const { GET } = await import("./route");
    const qs = token === null ? "" : `?token=${encodeURIComponent(token)}`;
    return GET(new Request(`https://campwatch.dev/api/me/verify-notification-email${qs}`));
}

describe("GET /api/me/verify-notification-email", () => {
    it("promotes pending to verified and redirects to the account page", async () => {
        const kv = seedProfile();
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const token = await signValue("me@gmail.com|me@icloud.com", "test-secret");

        const res = await doVerify(token);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://campwatch.dev/app/account?emailVerified=1");

        const stored = JSON.parse((await kv.get(PROFILE_KEY)) as string) as Record<string, unknown>;
        expect(stored.notificationEmail).toBe("me@icloud.com");
        expect(stored.pendingNotificationEmail).toBeUndefined();
    });

    it("rejects a tampered token", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(seedProfile());
        const token = await signValue("me@gmail.com|me@icloud.com", "wrong-secret");
        const res = await doVerify(token);
        expect(res.status).toBe(400);
    });

    it("rejects a missing token", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(seedProfile());
        const res = await doVerify(null);
        expect(res.status).toBe(400);
    });

    it("verifies an address that is no longer pending (self-contained consent)", async () => {
        const kv = seedProfile({ pendingNotificationEmail: "different@x.com" });
        vi.mocked(cloudflare.getKv).mockReturnValue(kv);
        const token = await signValue("me@gmail.com|me@icloud.com", "test-secret");

        const res = await doVerify(token);
        expect(res.status).toBe(302);
        const stored = JSON.parse((await kv.get(PROFILE_KEY)) as string) as Record<string, unknown>;
        expect(stored.notificationEmail).toBe("me@icloud.com");
    });

    it("400s for an unknown account", async () => {
        vi.mocked(cloudflare.getKv).mockReturnValue(createMockKv());
        const token = await signValue("ghost@gmail.com|me@icloud.com", "test-secret");
        const res = await doVerify(token);
        expect(res.status).toBe(400);
    });
});
