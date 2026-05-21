import { describe, it, expect } from "vitest";
import { jsonResponse, withCors } from "./responses";

describe("jsonResponse", () => {
    it("returns a JSON response with default 200 status", async () => {
        const r = jsonResponse({ ok: true });
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type")).toContain("application/json");
        expect(await r.json()).toEqual({ ok: true });
    });

    it("honors a custom status", () => {
        expect(jsonResponse({ error: "bad" }, 400).status).toBe(400);
    });
});

describe("withCors", () => {
    it("sets permissive CORS headers", () => {
        const r = withCors(new Response("hello"));
        expect(r.headers.get("access-control-allow-origin")).toBe("*");
        expect(r.headers.get("access-control-allow-methods")).toBe("GET, POST, PUT, OPTIONS");
        expect(r.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization");
    });
});
