/// <reference types="@cloudflare/workers-types" />

declare global {
    interface CloudflareEnv {
        SUBSCRIBERS: KVNamespace;
    }
}

export {};
