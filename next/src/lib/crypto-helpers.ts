const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(input: string): string {
    return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
    const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return atob(b64);
}

export function generateOpaqueToken(byteLength = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

async function hmacHex(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
    return bytesToHex(new Uint8Array(sig));
}

export async function signValue(value: string, secret: string): Promise<string> {
    const payload = base64UrlEncode(value);
    const sig = await hmacHex(payload, secret);
    return `${payload}.${sig}`;
}

export async function verifySignedValue(
    signed: string,
    secret: string,
): Promise<string | null> {
    const dot = signed.lastIndexOf(".");
    if (dot < 1 || dot >= signed.length - 1) return null;
    const payload = signed.slice(0, dot);
    const sig = signed.slice(dot + 1);
    if (!/^[a-f0-9]+$/i.test(sig)) return null;

    const expected = await hmacHex(payload, secret);
    if (expected.length !== sig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    try {
        return base64UrlDecode(payload);
    } catch {
        return null;
    }
}
