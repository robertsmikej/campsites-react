import type { SearchResult } from "@/app/api/campgrounds/search/route";
import { ResultSkeleton } from "./result-skeleton";

interface LookupSearchResultsProps {
    isSearching: boolean;
    searchResults: SearchResult[] | null;
    onPick: (r: SearchResult) => void;
    value: string;
    hasDisplayResult: boolean;
    /** Tailwind margin-top class — the two variants use slightly different spacing. */
    marginClass: string;
}

// The name-search results panel plus the "no matches" hint. Identical between the
// homepage and dashboard variants apart from vertical spacing.
export function LookupSearchResults({
    isSearching,
    searchResults,
    onPick,
    value,
    hasDisplayResult,
    marginClass,
}: LookupSearchResultsProps) {
    return (
        <>
            {(isSearching || (searchResults && searchResults.length > 0)) && (
                <div className={`${marginClass} bg-cw-cream border-[1.5px] border-cw-ink`}>
                    <div className="font-mono-field text-[12px] leading-none tracking-[0.18em] uppercase text-cw-clay py-3 px-[18px] border-b border-cw-rule font-bold">
                        {isSearching ? "Searching recreation.gov…" : `${searchResults?.length ?? 0} matches`}
                    </div>
                    {isSearching ? (
                        <div className="p-[18px]">
                            <ResultSkeleton />
                        </div>
                    ) : (
                        <ul className="list-none m-0 p-0">
                            {(searchResults ?? []).map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => onPick(r)}
                                        className="block w-full text-left bg-transparent border-none border-t border-dashed border-cw-rule py-[14px] px-[18px] cursor-pointer font-body-serif text-[16px] leading-[1.3] text-cw-ink"
                                    >
                                        <div className="font-poster text-[18px] leading-[1.05] uppercase tracking-[0.005em] font-black">
                                            {r.name}
                                        </div>
                                        <div className="font-italic-serif text-[14px] leading-[1.3] text-cw-ink-soft mt-[2px] font-medium italic">
                                            {[r.area, r.state].filter(Boolean).join(" · ") ||
                                                "Recreation.gov"}
                                        </div>
                                        <div className="font-mono-field text-[12px] leading-none text-cw-ink-soft tracking-[0.14em] mt-[6px] uppercase font-medium">
                                            ID {r.id}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {!isSearching && searchResults && searchResults.length === 0 && !hasDisplayResult && (
                <div
                    className={`${marginClass} bg-transparent border-[1.5px] border-dashed border-cw-rule py-5 px-[22px] font-italic-serif text-[16px] leading-[1.4] text-cw-ink-soft italic`}
                >
                    No recreation.gov campgrounds match &ldquo;{value.trim()}&rdquo;. Try a shorter or
                    different name.
                </div>
            )}
        </>
    );
}
