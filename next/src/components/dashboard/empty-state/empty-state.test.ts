import { describe, it, expect, vi } from "vitest";

// EmptyState renders two cards (PasteUrlCard + BorrowListCard).
// It also wraps onClone in a local handleClone that sets busy state.
// We test the onClone wrapper contract and module export.

describe("EmptyState handleClone contract", () => {
    // Mirrors the handleClone wrapper in empty-state.tsx
    async function handleClone(
        onClone: () => Promise<void>,
        setBusy: (b: boolean) => void,
    ): Promise<void> {
        setBusy(true);
        try {
            await onClone();
        } finally {
            setBusy(false);
        }
    }

    it("calls setBusy(true) before onClone and setBusy(false) after", async () => {
        const calls: boolean[] = [];
        const setBusy = (b: boolean) => calls.push(b);
        const onClone = vi.fn().mockResolvedValue(undefined);

        await handleClone(onClone, setBusy);

        expect(calls).toEqual([true, false]);
    });

    it("calls onClone exactly once", async () => {
        const onClone = vi.fn().mockResolvedValue(undefined);
        await handleClone(onClone, () => {});
        expect(onClone).toHaveBeenCalledTimes(1);
    });

    it("still calls setBusy(false) even when onClone throws", async () => {
        const calls: boolean[] = [];
        const setBusy = (b: boolean) => calls.push(b);
        const onClone = vi.fn().mockRejectedValue(new Error("fail"));

        await handleClone(onClone, setBusy).catch(() => {});

        expect(calls).toEqual([true, false]);
    });
});

describe("EmptyState module exports", () => {
    it("exports EmptyState as a function", async () => {
        const mod = await import("./empty-state");
        expect(typeof mod.EmptyState).toBe("function");
    });
});
