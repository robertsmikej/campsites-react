export interface GoogleAuthUrlParams {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes?: string[];
}

const DEFAULT_SCOPES = ["openid", "email", "profile"];

export function buildAuthorizationUrl(params: GoogleAuthUrlParams): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", (params.scopes ?? DEFAULT_SCOPES).join(" "));
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
}

export interface TokenExchangeParams {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface GoogleTokenResponse {
    id_token: string;
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: "Bearer";
}

export async function exchangeCodeForToken(params: TokenExchangeParams): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Google token exchange failed: ${response.status} ${text}`);
    }
    return (await response.json()) as GoogleTokenResponse;
}

export interface GoogleIdTokenPayload {
    iss: string;
    aud: string;
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
    picture?: string;
    exp: number;
    iat: number;
}

interface CachedJwks {
    keys: GoogleJwk[];
    fetchedAt: number;
}

interface GoogleJwk {
    kid: string;
    kty: string;
    use: string;
    alg: string;
    n: string;
    e: string;
}

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache: CachedJwks | null = null;

function base64UrlDecodeBytes(input: string): Uint8Array {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function base64UrlDecodeJson<T>(input: string): T {
    const decoded = base64UrlDecodeBytes(input);
    const text = new TextDecoder().decode(decoded);
    return JSON.parse(text) as T;
}

async function getJwks(): Promise<GoogleJwk[]> {
    if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
        return jwksCache.keys;
    }
    const r = await fetch(JWKS_URL);
    if (!r.ok) throw new Error(`JWKS fetch failed: ${r.status}`);
    const data = (await r.json()) as { keys: GoogleJwk[] };
    jwksCache = { keys: data.keys, fetchedAt: Date.now() };
    return data.keys;
}

export async function verifyIdToken(
    idToken: string,
    expectedAudience: string,
): Promise<GoogleIdTokenPayload> {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw new Error("Malformed ID token");
    const headerB64 = parts[0] ?? "";
    const payloadB64 = parts[1] ?? "";
    const signatureB64 = parts[2] ?? "";

    const header = base64UrlDecodeJson<{ alg: string; kid: string }>(headerB64);
    if (header.alg !== "RS256") throw new Error(`Unsupported alg: ${header.alg}`);

    const keys = await getJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) throw new Error(`No JWK matched kid ${header.kid}`);

    const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        jwk as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecodeBytes(signatureB64);
    const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
    new Uint8Array(signatureBuffer).set(signatureBytes);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signatureBuffer, data);
    if (!valid) throw new Error("ID token signature invalid");

    const payload = base64UrlDecodeJson<GoogleIdTokenPayload>(payloadB64);

    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
        throw new Error(`Unexpected iss: ${payload.iss}`);
    }
    if (payload.aud !== expectedAudience) throw new Error("aud mismatch");
    if (payload.exp * 1000 <= Date.now()) throw new Error("ID token expired");
    if (payload.email_verified !== true) throw new Error("email_verified is not true");

    return payload;
}
