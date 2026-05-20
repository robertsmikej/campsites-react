"use client";

import { FM, FI } from "@/components/field-notes/tokens";

interface ContactBlockProps {
    isMobile: boolean;
}

export function ContactBlock({ isMobile }: ContactBlockProps) {
    return (
        <div
            style={{
                textAlign: isMobile ? "left" : "right",
                font: `500 11px/1.8 ${FM}`,
                color: "rgba(251,246,234,0.7)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: isMobile ? 24 : undefined,
            }}
        >
            <div
                style={{
                    font: `500 10px/1 ${FM}`,
                    color: "rgba(251,246,234,0.5)",
                    letterSpacing: "0.18em",
                    marginBottom: 4,
                }}
            >
                Get in touch
            </div>
            <div>
                <a
                    href="mailto:hello@campwatch.app"
                    style={{ color: "inherit", textDecoration: "none" }}
                >
                    hello@campwatch.app
                </a>
            </div>
            <div style={{ marginTop: 12 }}>
                <a
                    href="https://github.com/robertsmikej/campsites-react"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "inherit", textDecoration: "none" }}
                >
                    Source on GitHub
                </a>
            </div>
            <div>recreation.gov · NPS</div>
            <div
                style={{
                    marginTop: 8,
                    fontFamily: FI,
                    fontSize: 17,
                    textTransform: "none",
                    fontStyle: "italic",
                    letterSpacing: 0,
                    color: "#f6c79c",
                }}
            >
                See you out there.
            </div>
        </div>
    );
}
