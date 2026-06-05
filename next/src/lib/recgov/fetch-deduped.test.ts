import { it, expect, vi } from "vitest";
import { fetchDedupedConcurrent, type FetchPlanItem } from "./fetch-deduped";

const plan: FetchPlanItem[] = [
    { campgroundId: "A", month: "2026-07" },
    { campgroundId: "A", month: "2026-08" },
    { campgroundId: "B", month: "2026-07" },
];

it("returns results grouped by campground, preserving month order", async () => {
    const fetchOne = vi.fn(async (id: string, month: string) => ({ id, month }));
    const out = await fetchDedupedConcurrent(plan, fetchOne, { concurrency: 2, maxRetries: 0 });
    expect(out["A"]).toEqual([
        { id: "A", month: "2026-07" },
        { id: "A", month: "2026-08" },
    ]);
    expect(out["B"]).toEqual([{ id: "B", month: "2026-07" }]);
});

it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { ok: true };
    });
    const big: FetchPlanItem[] = Array.from({ length: 10 }, (_, i) => ({
        campgroundId: "A",
        month: `2026-${String(i + 1).padStart(2, "0")}`,
    }));
    await fetchDedupedConcurrent(big, fetchOne, { concurrency: 3, maxRetries: 0, backoffMs: [] });
    expect(maxInFlight).toBeLessThanOrEqual(3);
});

it("retries on null then succeeds", async () => {
    let calls = 0;
    const fetchOne = vi.fn(async () => {
        calls++;
        return calls < 2 ? null : { ok: true };
    });
    const out = await fetchDedupedConcurrent([{ campgroundId: "A", month: "2026-07" }], fetchOne, {
        concurrency: 1,
        maxRetries: 2,
        backoffMs: [0, 0],
    });
    expect(out["A"]).toEqual([{ ok: true }]);
    expect(calls).toBe(2);
});

it("gives up after maxRetries and records null", async () => {
    const fetchOne = vi.fn(async () => null);
    const out = await fetchDedupedConcurrent([{ campgroundId: "A", month: "2026-07" }], fetchOne, {
        concurrency: 1,
        maxRetries: 2,
        backoffMs: [0, 0],
    });
    expect(out["A"]).toEqual([null]);
    expect(fetchOne).toHaveBeenCalledTimes(3); // initial + 2 retries
});
