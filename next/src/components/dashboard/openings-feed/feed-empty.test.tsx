import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FeedEmpty } from "./feed-empty";

describe("FeedEmpty", () => {
    it("renders the empty-state copy", () => {
        render(<FeedEmpty />);
        expect(screen.getByText(/no new openings today/i)).toBeInTheDocument();
    });

    it("mentions still watching", () => {
        render(<FeedEmpty />);
        expect(screen.getByText(/still watching/i)).toBeInTheDocument();
    });
});
