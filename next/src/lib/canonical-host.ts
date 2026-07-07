export const CANONICAL_HOST = "campwatch.dev";

// Returns the canonical https URL to 301 to when the request arrived on the
// www host, or null when the host is already canonical (or unknown, e.g.
// localhost in dev). Host headers are case-insensitive per RFC 9110.
export function canonicalRedirectUrl(host: string | null, pathname: string, search: string): string | null {
    if (host?.toLowerCase() !== `www.${CANONICAL_HOST}`) return null;
    return `https://${CANONICAL_HOST}${pathname}${search}`;
}
