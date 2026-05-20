import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/sessions";

// Paths that require a signed-in user. Anonymous visitors get 307'd to
// /auth/google/start with returnTo set to the original path + query.
const PROTECTED_PREFIXES = ["/app"];

function requiresAuth(pathname: string): boolean {
    return PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
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
    matcher: ["/app", "/app/:path*"],
};
