import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FaqItem } from "./faq-item";

const BASE_PROPS = {
    q: "Is this free?",
    a: "Yes, totally free.",
    index: 0,
};

describe("FaqItem — mobile (isMobile=true)", () => {
    it("renders a <details> element", () => {
        const { container } = render(<FaqItem {...BASE_PROPS} isMobile={true} />);
        expect(container.querySelector("details")).toBeInTheDocument();
    });

    it("renders the question inside <summary>", () => {
        render(<FaqItem {...BASE_PROPS} isMobile={true} />);
        expect(screen.getByText("Is this free?")).toBeInTheDocument();
    });

    it("renders the answer text", () => {
        render(<FaqItem {...BASE_PROPS} isMobile={true} />);
        expect(screen.getByText("Yes, totally free.")).toBeInTheDocument();
    });

    it("shows the Q.01 index label for index=0", () => {
        render(<FaqItem {...BASE_PROPS} isMobile={true} />);
        expect(screen.getByText("Q.01")).toBeInTheDocument();
    });
});

describe("FaqItem — desktop (isMobile=false)", () => {
    it("does not render a <details> element", () => {
        const { container } = render(<FaqItem {...BASE_PROPS} isMobile={false} />);
        expect(container.querySelector("details")).toBeNull();
    });

    it("renders the question text", () => {
        render(<FaqItem {...BASE_PROPS} isMobile={false} />);
        expect(screen.getByText("Is this free?")).toBeInTheDocument();
    });

    it("shows Q.02 for index=1", () => {
        render(<FaqItem {...BASE_PROPS} index={1} isMobile={false} />);
        expect(screen.getByText("Q.02")).toBeInTheDocument();
    });
});
