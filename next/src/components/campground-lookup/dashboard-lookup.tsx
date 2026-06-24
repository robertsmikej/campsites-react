"use client";

import { C } from "@/components/field-notes/tokens";
import { LookupStyles } from "./lookup-styles";
import { LookupSearchResults } from "./lookup-search-results";
import { ResultCard } from "./result-card";
import { ResultSkeleton } from "./result-skeleton";
import { useCampgroundLookup } from "./use-campground-lookup";

// Dialog/dashboard embed: no marketing wrapper, container-width layout. The
// homepage's viewport-keyed grid squeezes the input to nothing inside a dialog,
// so this variant gets a plain full-width input row.
export function DashboardLookup({ initialQuery }: { initialQuery?: string }) {
    const {
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
        previouslyWatched,
        handleInputChange,
        handleInputFocus,
        doLookup,
        pickSearchResult,
        handleAdd,
        handleReadd,
    } = useCampgroundLookup({ variant: "dashboard", initialQuery });

    return (
        <div className="px-4 pb-2 font-body-serif text-cw-ink">
            <LookupStyles />
            <div className="bg-cw-cream border-[1.5px] border-cw-ink flex items-stretch">
                <input
                    className="cw-input font-mono-field bg-transparent border-none text-cw-ink w-full min-w-0"
                    style={{ fontSize: 15, padding: "16px 14px" }}
                    type="text"
                    value={value}
                    placeholder="recreation.gov URL, ID, or name"
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={handleInputFocus}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void doLookup();
                    }}
                />
                <button
                    onClick={() => void doLookup()}
                    className="font-poster text-[13px] leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream border-none cursor-pointer flex items-center justify-center gap-[10px] font-extrabold"
                    style={{ padding: "0 22px", borderLeft: `1.5px solid ${C.ink}` }}
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

            {/* Previously watched */}
            {previouslyWatched.length > 0 && (
                <div className="mt-[18px] bg-cw-cream border-[1.5px] border-cw-ink">
                    <div className="font-mono-field text-[12px] leading-none tracking-[0.18em] uppercase text-cw-clay py-3 px-[18px] border-b border-cw-rule font-bold">
                        Previously watched
                    </div>
                    <ul className="list-none m-0 p-0">
                        {previouslyWatched.map((a) => (
                            <li
                                key={a.id}
                                className="flex items-center justify-between gap-3 border-t border-dashed border-cw-rule py-[12px] px-[18px] first:border-t-0"
                            >
                                <div className="min-w-0">
                                    <div className="font-poster text-[16px] leading-[1.05] uppercase tracking-[0.005em] font-black truncate">
                                        {a.name}
                                    </div>
                                    <div className="font-mono-field text-[11px] leading-none text-cw-ink-soft tracking-[0.14em] mt-[5px] uppercase font-medium">
                                        ID {a.id} · removed {new Date(a.removedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => void handleReadd(a)}
                                    disabled={adding}
                                    className="font-poster text-[11px] leading-none tracking-[0.14em] uppercase text-cw-cream border-none rounded-[2px] cursor-pointer whitespace-nowrap font-extrabold"
                                    style={{
                                        background: adding ? C.inkSoft : C.forest,
                                        padding: "10px 14px",
                                        cursor: adding ? "not-allowed" : "pointer",
                                    }}
                                >
                                    Re-add
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <LookupSearchResults
                isSearching={isSearching}
                searchResults={searchResults}
                onPick={pickSearchResult}
                value={value}
                hasDisplayResult={!!displayResult}
                marginClass="mt-[18px]"
            />

            {/* Result area */}
            <div className="mt-[18px]">
                {(authLoading && touched) || isLoading ? (
                    <ResultSkeleton />
                ) : displayResult ? (
                    <ResultCard
                        result={displayResult}
                        signedIn={signedIn}
                        onAdd={() => void handleAdd()}
                        adding={adding}
                        addedSuccess={addedSuccess}
                        dashboard
                    />
                ) : !searchResults && !isSearching ? (
                    <div className="bg-transparent border-[1.5px] border-dashed border-cw-rule py-5 px-[22px] flex flex-col justify-center gap-2">
                        <div className="font-body-serif text-[14px] leading-[1.5] text-cw-ink-soft">
                            Search by campground name (e.g.{" "}
                            <span className="font-mono-field text-[12px]">Stanley Lake</span>), paste a
                            recreation.gov URL, or a bare numeric ID like{" "}
                            <span className="font-mono-field text-[12px]">232358</span>.
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
