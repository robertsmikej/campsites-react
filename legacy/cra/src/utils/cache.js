const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export const setCache = (key, data) => {
    const entry = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(entry));
};

export const getCache = (key) => {
    const entryStr = localStorage.getItem(key);
    if (!entryStr) return null;

    try {
        const entry = JSON.parse(entryStr);
        if (Date.now() - entry.timestamp > CACHE_DURATION_MS) {
            localStorage.removeItem(key);
            return null;
        }
        return entry.data;
    } catch (e) {
        localStorage.removeItem(key);
        return null;
    }
};