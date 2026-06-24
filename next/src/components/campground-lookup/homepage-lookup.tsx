"use client";

import { C } from "@/components/field-notes/tokens";
import { LookupStyles } from "./lookup-styles";
import { LookupSearchResults } from "./lookup-search-results";
import { ResultCard } from "./result-card";
import { ResultSkeleton } from "./result-skeleton";
import { useCampgroundLookup } from "./use-campground-lookup";

const CHIPS = [
    { label: '"Redfish Lake" (name)', val: "Redfish Lake" },
    { label: "Outlet (catalog)", val: "232358" },
    { label: "Pine Flats (catalog)", val: "232312" },
];

const PAD_M = 22;

// Marketing-section variant: full "CHECK A SPOT" hero copy, demo chips, and the
// larger viewport-keyed input grid.
export function HomepageLookup() {
    const {
        isMobile,
        value,
        touched,
        authLoading,
        displayResult,
        isLoading,
        isSearching,
        searchResults,
        signedIn,
        adding,
        addedSuccess,
        handleInputChange,
        handleInputFocus,
        doLookup,
        fill,
        pickSearchResult,
        handleAdd,
    } = useCampgroundLookup({ variant: "homepage" });

    return (
        <section className="relative py-[60px] px-[22px] md:py-[88px] md:px-14 bg-cw-paper font-body-serif text-cw-ink border-t-[1.5px] border-cw-ink">
            <LookupStyles />

            <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-6 md:gap-14 items-start">
                {/* LEFT — copy */}
                <div>
                    <div className="font-mono-field text-[13px] leading-none tracking-[0.18em] text-cw-clay mb-[14px] font-medium uppercase">
                        LOOKUP
                    </div>
                    <h2 className="m-0 mb-[18px] tracking-[-0.005em]">
                        <span className="font-poster text-[56px] leading-[0.95] uppercase block font-black">
                            CHECK A SPOT
                        </span>
                        <span className="font-italic-serif text-[56px] leading-none block text-cw-forest mt-1 tracking-[-0.01em] font-medium italic">
                            before you add it.
                        </span>
                    </h2>
                    <p className="font-body-serif text-[17px] leading-[1.6] text-cw-ink-soft max-w-[460px] m-0 mb-[22px]">
                        Paste any campground URL or ID from <em>recreation.gov</em>. We&apos;ll tell you
                        whether it&apos;s already on our watch — and let you add it to your own list in one
                        click.
                    </p>
                    <div className="font-hand text-[22px] leading-[1.2] text-cw-clay -rotate-[2deg] inline-block font-semibold italic">
                        ↘ works from any URL on recreation.gov
                    </div>
                </div>

                {/* RIGHT — input + result */}
                <div>
                    {/* Input row */}
                    <div className="bg-cw-cream border-[1.5px] border-cw-ink block md:grid md:grid-cols-[128px_1fr_auto] items-stretch">
                        {!isMobile && (
                            <div className="bg-cw-ink text-cw-cream flex items-center justify-center font-mono-field text-[12px] leading-[1.2] tracking-[0.18em] uppercase text-center px-[10px] font-bold">
                                URL, ID, or name
                            </div>
                        )}
                        <div className={isMobile ? "flex items-stretch" : "contents"}>
                            <input
                                className="cw-input font-mono-field bg-transparent border-none border-l border-cw-rule text-cw-ink w-full min-w-0"
                                style={{
                                    fontSize: isMobile ? 13 : 16,
                                    padding: isMobile ? "14px 12px" : "20px 18px",
                                    borderLeft: `1px solid ${C.rule}`,
                                }}
                                type="text"
                                value={value}
                                placeholder={
                                    isMobile
                                        ? "recreation.gov/…/232358"
                                        : "Outlet Campground · 232358 · recreation.gov/camping/campgrounds/232358"
                                }
                                onChange={(e) => handleInputChange(e.target.value)}
                                onFocus={handleInputFocus}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void doLookup();
                                }}
                            />
                        </div>
                        <button
                            onClick={() => void doLookup()}
                            className="font-poster text-[13px] leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream border-none cursor-pointer flex items-center justify-center gap-[10px] font-extrabold"
                            style={{
                                padding: isMobile ? "16px 0" : "0 26px",
                                borderTop: isMobile ? `1.5px solid ${C.ink}` : undefined,
                                width: isMobile ? "100%" : undefined,
                            }}
                        >
                            Check
                            <svg width="14" height="14" viewBox="0 0 14 14">
                                <path
                                    d="M1 7 L13 7 M8 2 L13 7 L8 12"
                                    stroke={C.cream}
                                    strokeWidth="1.8"
                                    fill="none"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* Try chips */}
                    <div
                        className="mt-[14px] flex items-center gap-[10px]"
                        style={{
                            flexWrap: isMobile ? undefined : "wrap",
                            overflowX: isMobile ? "auto" : undefined,
                            paddingBottom: isMobile ? 4 : undefined,
                            marginLeft: isMobile ? -PAD_M : undefined,
                            paddingLeft: isMobile ? PAD_M : undefined,
                            marginRight: isMobile ? -PAD_M : undefined,
                            paddingRight: isMobile ? PAD_M : undefined,
                        }}
                    >
                        <span className="font-mono-field text-[12px] leading-none tracking-[0.16em] text-cw-ink-soft uppercase flex-shrink-0 font-medium">
                            Try →
                        </span>
                        {CHIPS.map((ex) => (
                            <button
                                key={ex.val}
                                className="cw-chip font-mono-field text-[13px] leading-none tracking-[0.06em] bg-transparent text-cw-ink py-[7px] px-[10px] border border-dashed border-cw-rule cursor-pointer transition-[background,color,border-color] duration-[140ms] font-medium"
                                style={{
                                    flexShrink: isMobile ? 0 : undefined,
                                    whiteSpace: isMobile ? "nowrap" : undefined,
                                }}
                                onClick={() => fill(ex.val)}
                            >
                                {ex.label}
                            </button>
                        ))}
                    </div>

                    <LookupSearchResults
                        isSearching={isSearching}
                        searchResults={searchResults}
                        onPick={pickSearchResult}
                        value={value}
                        hasDisplayResult={!!displayResult}
                        marginClass="mt-[22px]"
                    />

                    {/* Result area */}
                    <div className="mt-[22px] min-h-[200px]">
                        {authLoading && touched ? (
                            <ResultSkeleton />
                        ) : isLoading ? (
                            <ResultSkeleton />
                        ) : displayResult ? (
                            <ResultCard
                                result={displayResult}
                                signedIn={signedIn}
                                onAdd={() => void handleAdd()}
                                adding={adding}
                                addedSuccess={addedSuccess}
                            />
                        ) : !searchResults && !isSearching ? (
                            <div className="bg-transparent border-[1.5px] border-dashed border-cw-rule py-6 px-[26px] min-h-[160px] flex flex-col justify-center gap-2">
                                <div className="font-italic-serif text-[18px] leading-[1.3] text-cw-ink-soft font-medium italic">
                                    Waiting on a URL, ID, or name…
                                </div>
                                <div className="font-body-serif text-[14px] leading-[1.5] text-cw-ink-soft max-w-[480px]">
                                    Search by campground name (e.g.{" "}
                                    <span className="font-mono-field text-[12px]">Stanley Lake</span>), paste
                                    a recreation.gov URL, or a bare numeric ID like{" "}
                                    <span className="font-mono-field text-[12px]">232358</span>.
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
