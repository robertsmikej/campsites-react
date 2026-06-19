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
