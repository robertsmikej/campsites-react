import Link from "next/link";
import { Tent, CalendarRange, Mail, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
    return (
        <main className="bg-background text-foreground">
            <Hero />
            <SampleCards />
            <HowItWorks />
            <Footer />
        </main>
    );
}

function Hero() {
    return (
        <section className="relative overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-emerald-50/40 to-background dark:from-emerald-950/30 dark:via-emerald-950/10" />
            <div className="container mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
                <Tent className="mb-6 size-12 text-emerald-600" aria-hidden />
                <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                    Never miss a campsite opening at your favorite spots.
                </h1>
                <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
                    CampWatch checks recreation.gov every 15 minutes and emails you when the sites you actually want come available.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button size="lg" asChild>
                        <Link href="/auth/google/start?returnTo=/app">
                            Sign in with Google
                            <ArrowRight className="ml-1 size-4" />
                        </Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <Link href="/discover">Browse picks</Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}

function SampleCards() {
    const examples: Array<{ name: string; area: string; status: string; tone: "success" | "warn" }> = [
        { name: "Outlet Campground", area: "Redfish Lake, ID", status: "3 sites open Aug 18-21", tone: "success" },
        { name: "Pine Flats", area: "Lowman, ID", status: "1 site open Jul 5", tone: "success" },
        { name: "Stanley Lake", area: "Stanley, ID", status: "Watching", tone: "warn" },
    ];
    return (
        <section className="container mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-emerald-700">
                What your dashboard looks like
            </p>
            <h2 className="mb-8 text-center text-2xl font-semibold sm:text-3xl">Your watchlist, one glance</h2>
            <div className="grid gap-4 sm:grid-cols-3">
                {examples.map((e) => (
                    <Card key={e.name}>
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-base font-medium">{e.name}</h3>
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="size-3" />
                                        {e.area}
                                    </p>
                                </div>
                                <Badge variant={e.tone === "success" ? "default" : "secondary"}>
                                    {e.tone === "success" ? "Open" : "Watching"}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{e.status}</p>
                            <div className="h-1.5 w-full rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                <div className="h-full w-2/3 rounded-full bg-emerald-500" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    );
}

function HowItWorks() {
    const steps: Array<{ icon: React.ReactNode; title: string; body: string }> = [
        { icon: <Tent />, title: "Pick your campgrounds", body: "Add any campground on recreation.gov to your watchlist." },
        { icon: <CalendarRange />, title: "Set your filters", body: "Choose date ranges, stay lengths, and which days of the week you'll start." },
        { icon: <Mail />, title: "Get notified", body: "We email you the moment a site that fits opens up. Cancellations included." },
    ];
    return (
        <section className="border-t bg-muted/30 py-16 sm:py-20">
            <div className="container mx-auto max-w-5xl px-6">
                <h2 className="mb-10 text-center text-2xl font-semibold sm:text-3xl">How it works</h2>
                <div className="grid gap-8 sm:grid-cols-3">
                    {steps.map((s, i) => (
                        <div key={i} className="flex flex-col items-start">
                            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                                <span className="[&>svg]:size-5" aria-hidden>{s.icon}</span>
                            </div>
                            <h3 className="text-base font-medium">{s.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t py-8">
            <div className="container mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <p>Built by a camper, for campers.</p>
                <a
                    href="https://github.com/robertsmikej/campsites-react"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline"
                >
                    Source on GitHub
                </a>
            </div>
        </footer>
    );
}
