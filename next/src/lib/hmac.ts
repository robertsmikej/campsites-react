const encoder = new TextEncoder();

/**
 * Generate an HMAC-SHA-256 token for an email address, hex-encoded.
 * Matches the algorithm in workers-site/index.js so tokens cross-validate
 * between the old and new Workers during the migration window.
 */
export async function generateUnsubscribeToken(email: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(email));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time verify. Empty / malformed tokens return false without throwing.
 */
export async function verifyUnsubscribeToken(email: string, token: string, secret: string): Promise<boolean> {
    if (!token || !/^[a-f0-9]+$/i.test(token)) return false;
    const expected = await generateUnsubscribeToken(email, secret);
    if (expected.length !== token.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return mismatch === 0;
}
