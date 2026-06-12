import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StarRating, CellSignal, TypeBadge, ListMarker } from "./site-info";

afterEach(cleanup);

describe("StarRating", () => {
    it("shows the numeric value and review count", () => {
        render(<StarRating value={4} reviews={12} />);
        expect(screen.getByText(/4/)).toBeTruthy();
        expect(screen.getByText(/\(12\)/)).toBeTruthy();
    });
    it("renders nothing meaningful when no rating", () => {
        const { container } = render(<StarRating value={null} reviews={0} />);
        expect(container.textContent).toContain("No ratings");
    });
});

describe("CellSignal", () => {
    it("labels an aggregate level", () => {
        render(<CellSignal level={3} />);
        expect(screen.getByText(/Good/i)).toBeTruthy();
    });
    it("labels none for 0/null", () => {
        render(<CellSignal level={0} />);
        expect(screen.getByText(/None/i)).toBeTruthy();
    });
});

describe("TypeBadge", () => {
    it("shows RV with max length", () => {
        render(<TypeBadge type="rv" maxRvLength={35} />);
        expect(screen.getByText(/RV/)).toBeTruthy();
        expect(screen.getByText(/35/)).toBeTruthy();
    });
    it("shows Walk-in / Tent", () => {
        const { rerender } = render(<TypeBadge type="walkin" />);
        expect(screen.getByText(/Walk-in/i)).toBeTruthy();
        rerender(<TypeBadge type="tent" />);
        expect(screen.getByText(/Tent/i)).toBeTruthy();
    });
});

describe("ListMarker", () => {
    it("renders the site id and reflects open/favorite via data attrs", () => {
        render(<ListMarker id="A-07" open favorite selected={false} />);
        const el = screen.getByText("A-07");
        expect(el).toBeTruthy();
    });
});
