"use client";

export function ContactBlock() {
    return (
        <div className="text-left md:text-right font-mono-field text-[11px] leading-[1.8] text-[rgba(251,246,234,0.7)] tracking-[0.12em] uppercase mt-6 md:mt-0 font-medium">
            <div className="font-mono-field text-[10px] leading-none text-[rgba(251,246,234,0.5)] tracking-[0.18em] mb-1">
                Get in touch
            </div>
            <div>
                <a
                    href="mailto:hello@campwatch.dev"
                    className="text-inherit no-underline"
                >
                    hello@campwatch.dev
                </a>
            </div>
            <div className="mt-3">
                <a
                    href="https://github.com/robertsmikej/campsites-react"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit no-underline"
                >
                    Source on GitHub
                </a>
            </div>
            <div>recreation.gov · NPS</div>
            <div className="mt-2 font-italic-serif text-[17px] normal-case tracking-normal text-[#f6c79c] not-italic italic">
                See you out there.
            </div>
        </div>
    );
}
