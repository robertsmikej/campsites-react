import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

const assetManifest = JSON.parse(manifestJSON);

// --- Helpers ---

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const cors = (response) => {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Generate HMAC token for unsubscribe links (prevents unauthorized unsubscribes)
const generateToken = async (email, secret) => {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(email));
    return [...new Uint8Array(signature)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

const verifyToken = async (email, token, secret) => {
    const expected = await generateToken(email, secret);
    return token === expected;
};

// --- API Route Handlers ---

// POST /api/subscribe — { email: "user@example.com" }
const handleSubscribe = async (request, env) => {
    try {
        const body = await request.json();
        const email = body.email?.trim()?.toLowerCase();

        if (!email || !isValidEmail(email)) {
            return json({ error: 'Valid email address required' }, 400);
        }

        // Check if already subscribed
        const existing = await env.SUBSCRIBERS.get(`email:${email}`);
        if (existing) {
            return json({ message: 'Already subscribed' });
        }

        // Store subscriber
        await env.SUBSCRIBERS.put(
            `email:${email}`,
            JSON.stringify({ email, subscribedAt: new Date().toISOString() })
        );

        return json({ message: 'Subscribed successfully' });
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }
};

// GET /api/unsubscribe?email=...&token=...
const handleUnsubscribe = async (request, env) => {
    const url = new URL(request.url);
    const email = url.searchParams.get('email')?.trim()?.toLowerCase();
    const token = url.searchParams.get('token');

    if (!email || !token) {
        return new Response('Missing email or token', { status: 400 });
    }

    const isValid = await verifyToken(email, token, env.API_SECRET);
    if (!isValid) {
        return new Response('Invalid or expired unsubscribe link', { status: 403 });
    }

    await env.SUBSCRIBERS.delete(`email:${email}`);

    return new Response(
        `<!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
        <body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;">
            <h2>Unsubscribed</h2>
            <p>${email} has been removed from campsite availability notifications.</p>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
};

// GET /api/subscribers — protected, returns list for the notifier
const handleListSubscribers = async (request, env) => {
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const emails = [];
    let cursor = undefined;
    // KV list is paginated — iterate through all entries
    do {
        const result = await env.SUBSCRIBERS.list({ prefix: 'email:', cursor });
        for (const key of result.keys) {
            const value = await env.SUBSCRIBERS.get(key.name, 'json');
            if (value?.email) {
                emails.push(value.email);
            }
        }
        cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    return json({ subscribers: emails });
};

// GET /api/config — protected, returns campground config for the notifier
const handleGetConfig = async (request, env) => {
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.API_SECRET}`) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const data = await env.SUBSCRIBERS.get('config:campgrounds', 'json');
    if (!data) {
        return json({ error: 'No config found' }, 404);
    }

    return json(data);
};

// PUT /api/config — saves campground config from the UI
const handlePutConfig = async (request, env) => {
    // Auth is optional — if CONFIG_KEY is set, enforce it; otherwise allow unauthenticated writes.
    // This is acceptable because the data is non-sensitive (campground preferences).
    if (env.CONFIG_KEY) {
        const auth = request.headers.get('Authorization');
        if (!auth || auth !== `Bearer ${env.CONFIG_KEY}`) {
            return json({ error: 'Unauthorized' }, 401);
        }
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body || typeof body !== 'object' || !body.campgrounds) {
        return json({ error: 'Request body must include campgrounds' }, 400);
    }

    await env.SUBSCRIBERS.put('config:campgrounds', JSON.stringify(body));

    return json({ message: 'Config saved' });
};

// --- Main fetch handler ---

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return cors(new Response(null, { status: 204 }));
        }

        // API routes
        if (url.pathname === '/api/subscribe' && request.method === 'POST') {
            return cors(await handleSubscribe(request, env));
        }
        if (url.pathname === '/api/unsubscribe' && request.method === 'GET') {
            return await handleUnsubscribe(request, env);
        }
        if (url.pathname === '/api/subscribers' && request.method === 'GET') {
            return cors(await handleListSubscribers(request, env));
        }
        if (url.pathname === '/api/config' && request.method === 'GET') {
            return cors(await handleGetConfig(request, env));
        }
        if (url.pathname === '/api/config' && request.method === 'PUT') {
            return cors(await handlePutConfig(request, env));
        }

        // Static assets (existing SPA behavior)
        try {
            return await getAssetFromKV(
                {
                    request,
                    waitUntil: ctx.waitUntil.bind(ctx),
                },
                {
                    ASSET_NAMESPACE: env.__STATIC_CONTENT,
                    ASSET_MANIFEST: assetManifest,
                }
            );
        } catch (e) {
            // If not found, try serving index.html for SPA routing
            try {
                const notFoundResponse = await getAssetFromKV(
                    {
                        request: new Request(`${new URL(request.url).origin}/index.html`, request),
                        waitUntil: ctx.waitUntil.bind(ctx),
                    },
                    {
                        ASSET_NAMESPACE: env.__STATIC_CONTENT,
                        ASSET_MANIFEST: assetManifest,
                    }
                );
                return new Response(notFoundResponse.body, {
                    ...notFoundResponse,
                    status: 200,
                });
            } catch {
                return new Response('Not Found', { status: 404 });
            }
        }
    },
};
