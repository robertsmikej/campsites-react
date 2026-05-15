"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UserProfile } from "@/types/user";

interface UsersTableProps {
    users: UserProfile[];
    currentEmail: string;
    onToggleRole: (target: UserProfile, makeCurator: boolean) => Promise<void> | void;
}

export function UsersTable({ users, currentEmail, onToggleRole }: UsersTableProps) {
    if (users.length === 0) {
        return <p className="text-sm text-muted-foreground">No users yet.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Member since</TableHead>
                    <TableHead className="text-right">Curator</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {users.map((u) => {
                    const isCurator = u.roles?.includes("curator");
                    const isSelf = u.email.toLowerCase() === currentEmail.toLowerCase();
                    const memberSince = u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString()
                        : "—";
                    return (
                        <TableRow key={u.email}>
                            <TableCell className="font-medium">{u.email}</TableCell>
                            <TableCell>{u.name}</TableCell>
                            <TableCell>
                                {isCurator ? (
                                    <Badge variant="default">curator</Badge>
                                ) : (
                                    <span className="text-muted-foreground">—</span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{memberSince}</TableCell>
                            <TableCell className="text-right">
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
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
