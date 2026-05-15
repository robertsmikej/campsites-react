"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

const Schema = z.object({
    email: z.string().email("Enter a valid email"),
});

type FormValues = z.infer<typeof Schema>;

export function NotificationSubscribe() {
    const [submitting, setSubmitting] = useState(false);
    const form = useForm<FormValues>({
        resolver: zodResolver(Schema),
        defaultValues: { email: "" },
    });

    async function onSubmit(values: FormValues) {
        setSubmitting(true);
        try {
            const response = await fetch("/api/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: values.email }),
            });

            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as { error?: string };
                toast.error(data.error ?? "Subscription failed");
                return;
            }

            const data = (await response.json()) as { message?: string };
            toast.success(data.message ?? "Subscribed");
            form.reset();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Network error");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-end"
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>Get availability alerts</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    autoComplete="email"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Subscribing…" : "Subscribe"}
                </Button>
            </form>
        </Form>
    );
}
