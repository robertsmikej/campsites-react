import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ContactBlock } from "./contact-block";

describe("ContactBlock", () => {
    it("renders the mailto link with the correct address", () => {
        render(<ContactBlock />);
        const link = screen.getByRole("link", { name: /hello@campwatch\.dev/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "mailto:hello@campwatch.dev");
    });

    it("renders the GitHub link with rel=noopener noreferrer", () => {
        render(<ContactBlock />);
        const link = screen.getByRole("link", { name: /source on github/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "https://github.com/robertsmikej/campsites-react");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders the 'Get in touch' label", () => {
        render(<ContactBlock />);
        expect(screen.getByText(/get in touch/i)).toBeInTheDocument();
    });
});
