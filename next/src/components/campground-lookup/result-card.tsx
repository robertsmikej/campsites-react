import { C } from "@/components/field-notes/tokens";
import { LCheck, LWarn, LX } from "./result-icons";
import type { LookupResult } from "./types";

interface ResultCardProps {
    result: LookupResult;
    compact?: boolean;
    signedIn?: boolean;
    onAdd?: () => void;
    adding?: boolean;
    addedSuccess?: boolean;
    /** Dashboard add-flow: add-first copy and a stacked footer that fits a dialog. */
    dashboard?: boolean;
}

export function ResultCard({
    result,
    compact = false,
    signedIn = false,
    onAdd,
    adding = false,
    addedSuccess = false,
    dashboard = false,
}: ResultCardProps) {
    const padding = compact ? "py-4 px-[18px]" : "py-[22px] px-[26px]";
    if (!result) return null;

    // "invalid" — not a rec.gov URL at all
    if (result.state === "invalid") {
        return (
            <div
                className={`bg-cw-cream border-[1.5px] border-cw-rule ${padding} flex gap-[14px] items-start`}
            >
                <LX />
                <div className="flex-1">
                    <div className="font-poster text-[18px] leading-[1.1] uppercase text-[#A8412A] font-black">
                        NOT A RECREATION.GOV URL
                    </div>
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft mt-[6px] italic">
                        Paste a campground URL (e.g.{" "}
                        <span className="font-mono-field not-italic text-[12px]">
                            recreation.gov/camping/campgrounds/232358
                        </span>
                        ) or just the numeric ID.
                    </div>
                </div>
            </div>
        );
    }

    // "not-found" — valid-looking ID but rec.gov returned nothing
    if (result.state === "not-found") {
        return (
            <div
                className={`bg-cw-cream border-[1.5px] border-cw-rule ${padding} flex gap-[14px] items-start`}
            >
                <LX />
                <div className="flex-1">
                    <div className="font-poster text-[18px] leading-[1.1] uppercase text-[#A8412A] font-black">
                        CAMPGROUND NOT FOUND
                    </div>
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft mt-[6px] italic">
                        ID <span className="font-mono-field not-italic text-[12px]">#{result.parsedId}</span>{" "}
                        doesn&apos;t match a campground on recreation.gov. Double-check the URL.
                    </div>
                </div>
            </div>
        );
    }

    const cg = result.cg!;
    const isOnList = result.state === "on-list" || addedSuccess;
    const isWatched = result.state === "watched";

    let statusLabel: string;
    if (isOnList) statusLabel = "Already on your watchlist";
    else if (isWatched) statusLabel = "On our watch";
    // Homepage frames this as a "check a spot" verdict; the dashboard dialog is an
    // add flow, where "we don't track it yet" reads like a rejection. Flip to add-first.
    else
        statusLabel = dashboard
            ? "Not watched yet — ready to add"
            : "We can add this — we don't track it yet";

    let bodyText: string;
    if (isOnList) bodyText = "You're already watching this — we'll email you next time a site opens.";
    else if (isWatched)
        bodyText = "In the curator's default list. You can add it to your own watchlist in one click.";
    else bodyText = "New to our index. Polling will begin within five minutes of adding.";

    return (
        <div
            className={`bg-cw-cream border-[1.5px] border-cw-ink ${padding}`}
            style={{ boxShadow: compact ? "none" : `6px 6px 0 ${C.forest}` }}
        >
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        {isOnList ? <LCheck /> : isWatched ? <LCheck color={C.mustard} /> : <LWarn />}
                        <span className="font-mono-field text-[12px] leading-none tracking-[0.18em] text-cw-forest uppercase font-bold">
                            {statusLabel}
                        </span>
                    </div>
                    <div
                        className={`font-poster ${compact ? "text-[22px]" : "text-[28px]"} leading-none uppercase tracking-[0.005em] font-black`}
                    >
                        {cg.name}
                    </div>
                    <div
                        className={`font-italic-serif ${compact ? "text-[15px]" : "text-[18px]"} leading-[1.3] text-cw-ink-soft mt-1 font-medium italic`}
                    >
                        ID {cg.id}
                    </div>
                </div>
            </div>

            {!compact && (
                <div
                    className={`border-t border-dashed border-cw-rule mt-4 pt-[14px] flex gap-4 ${
                        dashboard ? "flex-col items-start" : "justify-between items-center"
                    }`}
                >
                    <div className="font-italic-serif text-[15px] leading-[1.4] text-cw-ink-soft max-w-[420px] font-medium italic">
                        {bodyText}
                    </div>
                    {isOnList ? (
                        <a
                            href="/app"
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase text-cw-ink border-[1.5px] border-cw-ink py-3 px-4 no-underline rounded-[2px] whitespace-nowrap font-extrabold"
                        >
                            Manage in dashboard →
                        </a>
                    ) : signedIn ? (
                        <button
                            onClick={onAdd}
                            disabled={adding}
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase text-cw-cream py-[14px] px-[18px] border-none rounded-[2px] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap font-extrabold"
                            style={{
                                background: adding ? C.inkSoft : C.forest,
                                cursor: adding ? "not-allowed" : "pointer",
                            }}
                        >
                            {adding ? "Adding…" : "Add to my watchlist"}
                            {!adding && (
                                <svg width="12" height="12" viewBox="0 0 12 12">
                                    <path
                                        d="M1 6 L11 6 M7 2 L11 6 L7 10"
                                        stroke={C.cream}
                                        strokeWidth="1.6"
                                        fill="none"
                                    />
                                </svg>
                            )}
                        </button>
                    ) : (
                        <a
                            href={`/auth/google/start?returnTo=${encodeURIComponent(`/app?add=${cg.id}`)}`}
                            className="font-poster text-[12px] leading-none tracking-[0.14em] uppercase bg-cw-forest text-cw-cream py-[14px] px-[18px] no-underline rounded-[2px] inline-flex items-center gap-2 whitespace-nowrap font-extrabold"
                        >
                            Sign in to add
                            <svg width="12" height="12" viewBox="0 0 12 12">
                                <path
                                    d="M1 6 L11 6 M7 2 L11 6 L7 10"
                                    stroke={C.cream}
                                    strokeWidth="1.6"
                                    fill="none"
                                />
                            </svg>
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
