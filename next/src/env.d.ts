/// <reference types="@cloudflare/workers-types" />

declare global {
    interface CloudflareEnv {
        SUBSCRIBERS: KVNamespace;
        API_SECRET?: string;
        CONFIG_KEY?: string;
    }
}

export {};
