export function isValidEmail(email: string): boolean {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string | undefined | null): string {
    if (typeof email !== "string") return "";
    return email.trim().toLowerCase();
}
