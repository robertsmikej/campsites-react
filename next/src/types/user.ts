import type { NotifyScope } from "./campground";

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
    /** Default notification scope for any campground that doesn't override it.
     *  If unset, treated as "worthwhile" — matches pre-feature behavior. */
    defaultNotifyScope?: NotifyScope;
    lastNotifiedAt?: string;
}
