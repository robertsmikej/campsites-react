import { describe, it, expect } from "vitest";
import { diffGroupsWithCooldown } from "./check";
import type { AdjacentGroup } from "../next/src/lib/adjacent-groups";

const g = (ids: string[], from: string, to: string): AdjacentGroup => ({
    campgroundId: "cg1",
    siteIds: ids,
    siteNames: ids,
    from,
    to,
    nights: 2,
    anchorTier: "none",
});
const now = new Date("2026-06-18T12:00:00Z").getTime();

describe("diffGroupsWithCooldown", () => {
    it("reports a brand-new group", () => {
        const { newGroups } = diffGroupsWithCooldown(
            [g(["012", "013"], "2026-06-19", "2026-06-21")],
            null,
            now,
        );
        expect(newGroups).toHaveLength(1);
    });

    it("suppresses a group already alerted within the cooldown", () => {
        const prior = {
            groups: {
                "cg1:012,013": [{ from: "2026-06-19", to: "2026-06-21", seen: new Date(now).toISOString() }],
            },
        };
        const { newGroups } = diffGroupsWithCooldown(
            [g(["012", "013"], "2026-06-19", "2026-06-21")],
            prior,
            now,
        );
        expect(newGroups).toHaveLength(0);
    });

    it("keeps the original seen on a range that is no longer visible (booked, then cancelled)", () => {
        // Tick 1: the group is alerted and stamped seen=T0.
        const t0 = now;
        const first = diffGroupsWithCooldown([g(["012", "013"], "2026-06-19", "2026-06-21")], null, t0);
        expect(first.newGroups).toHaveLength(1);
        expect(first.nextGroupState["cg1:012,013"]).toEqual([
            { from: "2026-06-19", to: "2026-06-21", seen: new Date(t0).toISOString() },
        ]);

        // Tick 2, an hour later: someone booked it, so it is not visible. The
        // retained range must keep seen=T0, not be re-stamped to now, or it never
        // ages out of the cooldown and a later cancellation never re-alerts.
        const t1 = t0 + 60 * 60 * 1000;
        const second = diffGroupsWithCooldown([], { groups: first.nextGroupState }, t1);
        expect(second.newGroups).toHaveLength(0);
        expect(second.nextGroupState["cg1:012,013"]).toEqual([
            { from: "2026-06-19", to: "2026-06-21", seen: new Date(t0).toISOString() },
        ]);
    });

    it("re-alerts a group that disappeared and comes back after the cooldown", () => {
        const t0 = now;
        const alerted = diffGroupsWithCooldown([g(["012", "013"], "2026-06-19", "2026-06-21")], null, t0);
        // Absent for 25 hours of ticks; the last tick before it reappears.
        const absent = diffGroupsWithCooldown(
            [],
            { groups: alerted.nextGroupState },
            t0 + 23 * 60 * 60 * 1000,
        );
        const back = diffGroupsWithCooldown(
            [g(["012", "013"], "2026-06-19", "2026-06-21")],
            { groups: absent.nextGroupState },
            t0 + 25 * 60 * 60 * 1000,
        );
        expect(back.newGroups).toHaveLength(1);
    });

    it("re-alerts after the cooldown elapses", () => {
        const stale = new Date(now - 25 * 60 * 60 * 1000).toISOString();
        const prior = {
            groups: { "cg1:012,013": [{ from: "2026-06-19", to: "2026-06-21", seen: stale }] },
        };
        const { newGroups } = diffGroupsWithCooldown(
            [g(["012", "013"], "2026-06-19", "2026-06-21")],
            prior,
            now,
        );
        expect(newGroups).toHaveLength(1);
    });
});
