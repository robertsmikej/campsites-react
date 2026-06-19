import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdjacentBadge } from "./adjacent-badge";

const group = (siteIds: string[]) => ({
    campgroundId: "cg1", siteIds, siteNames: siteIds,
    from: "2026-06-19", to: "2026-06-21", nights: 2, anchorTier: "none" as const,
});

describe("AdjacentBadge", () => {
    it("renders nothing when there are no groups", () => {
        const { container } = render(<AdjacentBadge groups={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it("shows the size of the largest group", () => {
        render(<AdjacentBadge groups={[group(["012", "013"]), group(["020", "021", "022"])]} />);
        expect(screen.getByText(/3 adjacent/i)).toBeInTheDocument();
    });
});
