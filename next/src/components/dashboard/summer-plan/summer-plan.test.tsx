import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummerPlan } from "./summer-plan";
import { summerWindow } from "@/lib/summer-planner";
import type { ProcessedCampground, SiteAvailability } from "@/types/campground";

function site(name: string, from: string, to: string): SiteAvailability {
    return {
        siteId: `id-${name}`,
        siteName: name,
        dates: [],
        excludedMatches: [],
        matches: [{ from, to, nights: Math.round((+new Date(to) - +new Date(from)) / 86400000) }],
    };
}
function cg(id: string, name: string, sites: SiteAvailability[], favorites: string[]): ProcessedCampground {
    return {
        id,
        name,
        area: "",
        sites: { favorites, worthwhile: [] },
        siteAvailability: Object.fromEntries(sites.map((s) => [s.siteId, s])),
    } as unknown as ProcessedCampground;
}

describe("SummerPlan", () => {
    it("renders a trip card per planned trip with a book link", () => {
        const rows = [
            cg("1", "June CG", [site("a", "2026-06-12", "2026-06-14")], ["a"]),
            cg("2", "July CG", [site("b", "2026-07-17", "2026-07-19")], ["b"]),
            cg("3", "Aug CG", [site("c", "2026-08-14", "2026-08-16")], ["c"]),
        ];
        render(<SummerPlan rows={rows} window={summerWindow(2026)} />);
        expect(screen.getByText("June CG")).toBeTruthy();
        expect(screen.getByText("July CG")).toBeTruthy();
        expect(screen.getByText("Aug CG")).toBeTruthy();
        expect(
            screen.getAllByRole("link", { name: /book on recreation.gov/i }).length,
        ).toBeGreaterThanOrEqual(3);
    });

    it("regenerate swaps to the alternative site when one exists", () => {
        // One campground, two open sites: distinct-campground rule means only one
        // is chosen; the favorite (x) wins first, regenerate should fall to y.
        const rows = [
            cg(
                "30",
                "Tahoe",
                [site("x", "2026-07-10", "2026-07-12"), site("y", "2026-07-10", "2026-07-12")],
                ["x"],
            ),
        ];
        render(<SummerPlan rows={rows} window={summerWindow(2026)} />);
        expect(screen.getByRole("link", { name: /book/i }).getAttribute("href")).toContain("id-x");
        fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));
        expect(screen.getByRole("link", { name: /book/i }).getAttribute("href")).toContain("id-y");
    });

    it("shows the empty state when there are no openings", () => {
        render(<SummerPlan rows={[]} window={summerWindow(2026)} />);
        expect(screen.getByText(/no summer openings yet/i)).toBeTruthy();
    });
});
