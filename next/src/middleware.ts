import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canonicalRedirectUrl } from "@/lib/canonical-host";
import { SESSION_COOKIE } from "@/lib/sessions";

// Paths that require a signed-in user. Anonymous visitors get 307'd to
// /auth/google/start with returnTo set to the original path + query.
const PROTECTED_PREFIXES = ["/app"];

function requiresAuth(pathname: string): boolean {
    return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // www.campwatch.dev is attached to this worker only so we can bounce it
    // here; the apex is the single canonical origin (service worker and push
    // subscriptions are origin-scoped, so the app must never serve on www).
    const canonical = canonicalRedirectUrl(request.headers.get("host"), pathname, request.nextUrl.search);
    if (canonical) return NextResponse.redirect(canonical, 301);

    // Signed-in visitors to the marketing homepage go straight to their dashboard,
    // unless they explicitly asked to see it (?home — the account menu's "Home page"
    // link uses this). Dev skips the redirect (the DEV_USER bypass has no cookie).
    if (pathname === "/") {
        if (process.env.NODE_ENV !== "production") return NextResponse.next();
        if (searchParams.has("home")) return NextResponse.next();
        if (request.cookies.get(SESSION_COOKIE)?.value) {
            const url = request.nextUrl.clone();
            url.pathname = "/app";
            url.search = "";
            return NextResponse.redirect(url);
        }
        return NextResponse.next();
    }

    if (!requiresAuth(pathname)) return NextResponse.next();

    // In dev, the DEV_USER bypass authenticates via env var without ever
    // setting a session cookie — so the cookie check below would always
    // bounce a dev user. Skip the redirect entirely in non-production;
    // the page itself still calls /api/me and renders correctly.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();

    const session = request.cookies.get(SESSION_COOKIE);
    if (session?.value) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/discover";
    url.search = "";
    return NextResponse.redirect(url);
}

export const config = {
    // All paths, not just the auth-gated ones: the www redirect must cover
    // every URL. The auth logic above still only acts on "/" and "/app/*".
    matcher: ["/:path*"],
};
