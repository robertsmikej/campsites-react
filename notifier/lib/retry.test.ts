import { describe, it, expect, vi } from "vitest";
import { retry, assertOk } from "./retry";

const noSleep = async (_ms: number): Promise<void> => {};

describe("retry", () => {
    it("returns the first successful result without sleeping", async () => {
        const sleep = vi.fn(noSleep);
        const result = await retry(async () => "ok", { attempts: 3, baseDelayMs: 100, label: "t", sleep });
        expect(result).toBe("ok");
        expect(sleep).not.toHaveBeenCalled();
    });

    it("retries with doubling delays and returns the eventual success", async () => {
        const sleep = vi.fn(noSleep);
        let calls = 0;
        const operation = async (): Promise<string> => {
            calls += 1;
            if (calls < 3) {
                throw new Error(`boom ${calls}`);
            }
            return "third time";
        };
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const result = await retry(operation, { attempts: 3, baseDelayMs: 100, label: "t", sleep });
        expect(result).toBe("third time");
        expect(calls).toBe(3);
        expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
    });

    it("rethrows the last error once attempts are exhausted", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const operation = async (): Promise<never> => {
            throw new Error("always");
        };
        await expect(
            retry(operation, { attempts: 2, baseDelayMs: 1, label: "t", sleep: noSleep }),
        ).rejects.toThrow("always");
    });
});

describe("assertOk", () => {
    it("passes 2xx responses through", () => {
        const response = new Response("", { status: 200 });
        expect(assertOk(response, "x")).toBe(response);
    });

    it("throws with the status for non-2xx responses", () => {
        expect(() => assertOk(new Response("", { status: 502 }), "state PUT")).toThrow(
            "state PUT returned HTTP 502",
        );
    });
});
