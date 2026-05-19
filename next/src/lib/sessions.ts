import { getEnv, getKv } from "./cloudflare";
import { generateOpaqueToken } from "./crypto-helpers";
import { bootstrapCuratorIfFirst, createUserProfile, getUserProfile } from "./users";

export interface Session {
    id: string;
    email: string;
    createdAt: string;
    expiresAt: string;
    userAgent?: string;
}

export const SESSION_COOKIE = "campwatch_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function sessionKey(id: string): string {
    return `session:${id}`;
}

function buildCookie(value: string, maxAge: number): string {
    return [
        `${SESSION_COOKIE}=${value}`,
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${maxAge}`,
    ].join("; ");
}

export function clearingCookie(): string {
    return buildCookie("", 0);
}

function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get("Cookie");
    if (!header) return null;
    for (const part of header.split(";")) {
        const [k, ...rest] = part.trim().split("=");
        if (k === name) return rest.join("=");
    }
    return null;
}

export async function createSession(
    email: string,
    request: Request,
): Promise<{ session: Session; cookie: string }> {
    const id = generateOpaqueToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    const userAgent = request.headers.get("User-Agent") ?? undefined;

    const session: Session = {
        id,
        email,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        ...(userAgent ? { userAgent } : {}),
    };

    await getKv().put(sessionKey(id), JSON.stringify(session));
    return { session, cookie: buildCookie(id, SESSION_TTL_SECONDS) };
}

export async function readSession(request: Request): Promise<Session | null> {
    const id = readCookie(request, SESSION_COOKIE);
    if (id) {
        const kv = getKv();
        const session = (await kv.get(sessionKey(id), "json")) as Session | null;
        if (session && new Date(session.expiresAt).getTime() > Date.now()) {
            return session;
        }
        if (session) {
            await kv.delete(sessionKey(id));
        }
    }

    // Dev-only bypass — opens the app to whoever DEV_USER is set to.
    // NEVER activates in production: NODE_ENV is set to "production" in built workers.
    if (process.env.NODE_ENV !== "production") {
        const devUser = getEnv().DEV_USER;
        if (devUser) {
            return await getOrCreateDevSession(devUser);
        }
    }

    return null;
}

/**
 * Returns a synthetic session for local development. The session is NOT written
 * to KV — it is rebuilt on every request. If no user profile exists for the
 * given email, one is created and the curator bootstrap runs.
 */
async function getOrCreateDevSession(email: string): Promise<Session> {
    const env = getEnv();

    const existing = await getUserProfile(email);
    if (!existing) {
        await createUserProfile(email, { name: email });
        await bootstrapCuratorIfFirst(email, env.BOOTSTRAP_ADMIN_EMAIL);
    }

    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    return {
        id: `dev:${email}`,
        email,
        createdAt: new Date().toISOString(),
        expiresAt: farFuture,
    };
}

export async function destroySession(request: Request): Promise<{ cookie: string }> {
    const id = readCookie(request, SESSION_COOKIE);
    if (id) {
        await getKv().delete(sessionKey(id));
    }
    return { cookie: clearingCookie() };
}
