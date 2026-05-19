export type UserRole = "curator";

export interface UserProfile {
    email: string;
    name: string;
    picture?: string;
    roles: UserRole[];
    createdAt: string;
    notifications?: {
        enabled: boolean;
        frequencyMinutes: 5 | 15 | 60 | 240;
    };
    lastNotifiedAt?: string;
}
