import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockKv } from "./__mocks__/cloudflare-test-helpers";
import * as cloudflare from "./cloudflare";
import {
    getUserProfile,
    createUserProfile,
    updateUserProfile,
    deleteUser,
    bootstrapCuratorIfFirst,
    listCurators,
} from "./users";

beforeEach(() => {
    vi.resetModules();
});

describe("user profile CRUD", () => {
    it("creates and reads a profile", async () => {
        const kv = createMockKv();
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        await createUserProfile("user@example.com", {
            name: "User",
            picture: "https://example.com/avatar.png",
        });

        const profile = await getUserProfile("user@example.com");
        expect(profile).toMatchObject({
            email: "user@example.com",
            name: "User",
            picture: "https://example.com/avatar.png",
            roles: [],
        });
        expect(typeof profile?.createdAt).toBe("string");
    });

    it("returns null for unknown email", async () => {
        vi.spyOn(cloudflare, "getKv").mockReturnValue(createMockKv());
        expect(await getUserProfile("nope@example.com")).toBeNull();
    });

    it("merges patches via updateUserProfile", async () => {
        const kv = createMockKv({
            "user:user@example.com:profile": JSON.stringify({
                email: "user@example.com",
                name: "Old",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const updated = await updateUserProfile("user@example.com", { name: "New" });
        expect(updated?.name).toBe("New");

        const reread = await getUserProfile("user@example.com");
        expect(reread?.name).toBe("New");
        expect(reread?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("deleteUser removes profile + per-user keys + sessions", async () => {
        const kv = createMockKv({
            "user:user@example.com:profile": "{}",
            "user:user@example.com:campgrounds": "{}",
            "session:abc": JSON.stringify({ email: "user@example.com" }),
            "session:other": JSON.stringify({ email: "someone-else@example.com" }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        await deleteUser("user@example.com");

        expect(await kv.get("user:user@example.com:profile")).toBeNull();
        expect(await kv.get("user:user@example.com:campgrounds")).toBeNull();
        expect(await kv.get("session:abc")).toBeNull();
        expect(await kv.get("session:other")).not.toBeNull();
    });
});

describe("bootstrap curator", () => {
    it("grants curator on first matching sign-in when no curator exists", async () => {
        const kv = createMockKv({
            "user:bootstrap@example.com:profile": JSON.stringify({
                email: "bootstrap@example.com",
                name: "Boss",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("bootstrap@example.com", "bootstrap@example.com");
        expect(granted).toBe(true);
        expect((await getUserProfile("bootstrap@example.com"))?.roles).toContain("curator");
    });

    it("does not grant curator if a curator already exists", async () => {
        const kv = createMockKv({
            "user:existing-curator@example.com:profile": JSON.stringify({
                email: "existing-curator@example.com",
                name: "Existing",
                roles: ["curator"],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
            "user:bootstrap@example.com:profile": JSON.stringify({
                email: "bootstrap@example.com",
                name: "Boss",
                roles: [],
                createdAt: "2026-01-02T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("bootstrap@example.com", "bootstrap@example.com");
        expect(granted).toBe(false);
        expect((await getUserProfile("bootstrap@example.com"))?.roles).not.toContain("curator");
    });

    it("does not grant when emails don't match", async () => {
        const kv = createMockKv({
            "user:other@example.com:profile": JSON.stringify({
                email: "other@example.com",
                name: "Other",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("other@example.com", "bootstrap@example.com");
        expect(granted).toBe(false);
    });

    it("emails compare case-insensitively for bootstrap", async () => {
        const kv = createMockKv({
            "user:user@example.com:profile": JSON.stringify({
                email: "user@example.com",
                name: "User",
                roles: [],
                createdAt: "2026-01-01T00:00:00.000Z",
            }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const granted = await bootstrapCuratorIfFirst("user@example.com", "User@Example.COM");
        expect(granted).toBe(true);
    });

    it("listCurators returns curator emails", async () => {
        const kv = createMockKv({
            "user:a@x.com:profile": JSON.stringify({ email: "a@x.com", roles: ["curator"] }),
            "user:b@x.com:profile": JSON.stringify({ email: "b@x.com", roles: [] }),
            "user:c@x.com:profile": JSON.stringify({ email: "c@x.com", roles: ["curator"] }),
        });
        vi.spyOn(cloudflare, "getKv").mockReturnValue(kv);

        const curators = await listCurators();
        expect(curators.sort()).toEqual(["a@x.com", "c@x.com"]);
    });
});
