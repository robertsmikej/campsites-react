/// <reference types="@cloudflare/workers-types" />

declare global {
    interface CloudflareEnv {
        SUBSCRIBERS: KVNamespace;
        API_SECRET?: string;
        CONFIG_KEY?: string;
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        SESSION_SECRET?: string;
        BOOTSTRAP_ADMIN_EMAIL?: string;
    }
}

export {};
