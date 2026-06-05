import { CW } from "@/components/field-notes/cw-tokens";
import { type Horizon, dowRangeLabel, siteOpenRuns, siteRangeUrl } from "@/lib/timeline";
import type { SiteAvailability } from "@/types/campground";

interface SiteWindowsListProps {
    horizon: Horizon;
    site: SiteAvailability;
    /** left inset so the list aligns under the site label */
    indent?: number;
}

/** The available date ranges for one site, each linking out to recreation.gov
 *  pre-filled with that range's dates. Revealed when a site is clicked. */
export function SiteWindowsList({ horizon, site, indent = 50 }: SiteWindowsListProps) {
    const runs = siteOpenRuns(horizon, site);
    if (runs.length === 0) {
        return (
            <div
                className="font-italic-serif italic"
                style={{ padding: `4px ${indent}px 10px`, fontSize: 13, color: CW.inkFaint }}
            >
                No open dates in this window.
            </div>
        );
    }
    return (
        <div style={{ padding: `2px ${indent}px 10px` }}>
            {runs.map((run, i) => {
                const [s, e] = run;
                const nights = e - s + 1;
                return (
                    <a
                        key={i}
                        href={siteRangeUrl(site.siteId, horizon, run)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(ev) => ev.stopPropagation()}
                        className="flex items-baseline justify-between gap-3 border-b border-dotted py-[6px] no-underline last:border-b-0 hover:underline"
                        style={{ borderColor: CW.ruleSoft }}
                    >
                        <span className="font-body-serif" style={{ fontSize: 13, color: CW.ink }}>
                            {dowRangeLabel(horizon, s, e)}
                        </span>
                        <span
                            className="shrink-0 font-mono-field font-bold uppercase"
                            style={{ fontSize: 10, letterSpacing: "0.06em", color: CW.forest }}
                        >
                            {nights}n · book →
                        </span>
                    </a>
                );
            })}
        </div>
    );
}
