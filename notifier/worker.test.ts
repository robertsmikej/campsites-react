import { describe, it, expect, vi, beforeEach } from "vitest";

const { runTick, runSweep } = vi.hoisted(() => ({
    runTick: vi.fn(async () => {}),
    runSweep: vi.fn(async () => {}),
}));
vi.mock("./check", () => ({ runTick, runSweep }));
vi.mock("../next/src/lib/recgov/worker-kv", () => ({ WorkerKvAdapter: class {} }));

import worker from "./worker";

const env = {
    SUBSCRIBERS: { get: async () => null, put: async () => {} },
    RESEND_API_KEY: "re_x",
    SUBSCRIBER_API_SECRET: "secret",
    SUBSCRIBER_API_URL: "https://campwatch.dev",
    SITE_URL: "https://campwatch.dev",
    DRY_RUN: "false",
} as never;
const ctx = { waitUntil: (p: Promise<unknown>) => p } as never;

beforeEach(() => {
    runTick.mockClear();
    runSweep.mockClear();
});

describe("worker scheduled dispatch", () => {
    it("runs the tick (fast-lane + notify) on the every-minute cron", async () => {
        await worker.scheduled({ cron: "* * * * *", scheduledTime: 1_781_790_000_000 } as never, env, ctx);
        expect(runTick).toHaveBeenCalledTimes(1);
        expect(runSweep).not.toHaveBeenCalled();
    });
    it("runs the sweep on the */5 cron", async () => {
        await worker.scheduled({ cron: "*/5 * * * *", scheduledTime: 1_781_790_000_000 } as never, env, ctx);
        expect(runSweep).toHaveBeenCalledTimes(1);
        expect(runTick).not.toHaveBeenCalled();
    });
});
