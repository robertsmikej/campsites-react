"use client";

import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserProfile } from "@/types/user";

interface UsersTableProps {
    users: UserProfile[];
    currentEmail: string;
    onToggleRole: (target: UserProfile, makeCurator: boolean) => Promise<void> | void;
}

export function UsersTable({ users, currentEmail, onToggleRole }: UsersTableProps) {
    if (users.length === 0) {
        return (
            <p className="font-italic-serif text-[16px] italic text-cw-ink-soft">No users yet.</p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="border-b border-cw-rule">
                        <th className="py-2 pr-4 text-left font-mono-field text-[10px] font-bold uppercase tracking-[0.16em] text-cw-clay">
                            Email
                        </th>
                        <th className="py-2 pr-4 text-left font-mono-field text-[10px] font-bold uppercase tracking-[0.16em] text-cw-clay">
                            Name
                        </th>
                        <th className="py-2 pr-4 text-left font-mono-field text-[10px] font-bold uppercase tracking-[0.16em] text-cw-clay">
                            Roles
                        </th>
                        <th className="py-2 pr-4 text-left font-mono-field text-[10px] font-bold uppercase tracking-[0.16em] text-cw-clay">
                            Member since
                        </th>
                        <th className="py-2 text-right font-mono-field text-[10px] font-bold uppercase tracking-[0.16em] text-cw-clay">
                            Curator
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => {
                        const isCurator = u.roles?.includes("curator");
                        const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
                        const memberSince = u.createdAt
                            ? new Date(u.createdAt).toLocaleDateString()
                            : "—";
                        return (
                            <tr key={u.email} className="border-b border-cw-rule-soft last:border-0">
                                <td className="py-3 pr-4 font-mono-field text-[12px] text-cw-ink">
                                    {u.email}
                                </td>
                                <td className="py-3 pr-4 font-body-serif text-[14px] text-cw-ink">
                                    {u.name ?? <span className="text-cw-ink-soft">—</span>}
                                </td>
                                <td className="py-3 pr-4">
                                    {isCurator ? (
                                        <span className="font-mono-field text-[10px] font-bold uppercase tracking-[0.14em] px-[7px] py-[3px] rounded-[2px] bg-cw-clay text-cw-cream">
                                            curator
                                        </span>
                                    ) : (
                                        <span className="font-mono-field text-[12px] text-cw-ink-soft">—</span>
                                    )}
                                </td>
                                <td className="py-3 pr-4 font-mono-field text-[12px] text-cw-ink-soft">
                                    {memberSince}
                                </td>
                                <td className="py-3 text-right">
                                    {isSelf ? (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="inline-flex">
                                                    <Switch checked={isCurator} disabled />
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>You can&apos;t change your own role</TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        <Switch
                                            checked={isCurator}
                                            onCheckedChange={(checked) => onToggleRole(u, checked)}
                                        />
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
