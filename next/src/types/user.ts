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
        frequencyMinutes: 1 | 5 | 15 | 60 | 240;
    };
    /** Default notification scope for any campground that doesn't override it.
     *  If unset, treated as "worthwhile" — matches pre-feature behavior. */
    defaultNotifyScope?: NotifyScope;
    lastNotifiedAt?: string;
    /** Verified alert-delivery address. Absent = deliver to the login email. */
    notificationEmail?: string;
    /** Address awaiting confirmation; alerts keep going to the effective address until verified. */
    pendingNotificationEmail?: string;
    /** ISO timestamp of when the user last saw the curator's default list. The
     *  "recently added" nudge only surfaces defaults added after this. Seeded at
     *  signup, and bumped on borrow / add-all / dismiss. */
    defaultSeenAt?: string;
}
