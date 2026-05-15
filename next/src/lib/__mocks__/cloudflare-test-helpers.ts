import type { KVNamespace, KVNamespaceListResult } from "@cloudflare/workers-types";

export interface MockKvNamespace extends KVNamespace {
    _store: Map<string, string>;
}

export function createMockKv(initial: Record<string, string> = {}): MockKvNamespace {
    const store = new Map<string, string>(Object.entries(initial));

    const kv = {
        _store: store,

        async get(key: string, type?: "text" | "json") {
            const value = store.get(key);
            if (value === undefined) return null;
            if (type === "json") return JSON.parse(value);
            return value;
        },

        async put(key: string, value: string) {
            store.set(key, value);
        },

        async delete(key: string) {
            store.delete(key);
        },

        async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}): Promise<KVNamespaceListResult<unknown, string>> {
            const keys = Array.from(store.keys())
                .filter((k) => (prefix ? k.startsWith(prefix) : true))
                .sort()
                .map((name) => ({ name }));
            return {
                keys,
                list_complete: true,
                cacheStatus: null,
            } as KVNamespaceListResult<unknown, string>;
        },

        async getWithMetadata() {
            throw new Error("not implemented in mock");
        },
    };

    return kv as unknown as MockKvNamespace;
}
