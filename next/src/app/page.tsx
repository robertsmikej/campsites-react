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
            {/* Background photo — Unsplash license */}
            <div className="absolute inset-0 -z-10">
                <img
                    src="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=2000&q=80"
                    alt=""
                    aria-hidden
                    className="size-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/70 to-background/40 dark:from-background/90 dark:via-background/70 dark:to-background/50" />
                {/* topographic texture overlay at very low opacity */}
                <div
                    className="absolute inset-0 opacity-[0.07] text-foreground"
                    style={{
                        backgroundImage: "url(/textures/topo.svg)",
                        backgroundSize: "400px 400px",
                    }}
                    aria-hidden
                />
            </div>

            <div className="container mx-auto flex max-w-4xl flex-col items-start px-6 py-32 sm:py-40">
                <Tent className="mb-6 size-12 text-primary" aria-hidden />
                <h1 className="font-display text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                    Never miss a campsite opening at{" "}
                    <span className="text-accent">your favorite spots.</span>
                </h1>
                <p className="mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
                    CampWatch checks recreation.gov every 15 minutes and emails you the moment a site
                    you actually want comes available.
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
    const examples = [
        { name: "Outlet Campground", area: "Redfish Lake, ID", status: "3 sites open Aug 18–21", tone: "open" },
        { name: "Pine Flats", area: "Lowman, ID", status: "1 site open Jul 5", tone: "open" },
        { name: "Stanley Lake", area: "Stanley, ID", status: "Watching", tone: "muted" },
    ];
    return (
        <section className="container mx-auto max-w-5xl px-6 py-20">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                What your dashboard looks like
            </p>
            <h2 className="mb-12 text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Your watchlist, one glance
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
                {examples.map((e, i) => (
                    <Card key={e.name} className="overflow-hidden transition-shadow hover:shadow-md">
                        {/* gradient placeholder for the hero */}
                        <div
                            className="aspect-[5/3] w-full"
                            style={{
                                background:
                                    i === 0
                                        ? "linear-gradient(135deg, oklch(0.55 0.13 150), oklch(0.35 0.08 150))"
                                        : i === 1
                                        ? "linear-gradient(135deg, oklch(0.62 0.16 40), oklch(0.42 0.10 50))"
                                        : "linear-gradient(135deg, oklch(0.55 0.06 240), oklch(0.32 0.04 240))",
                            }}
                            aria-hidden
                        />
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-display truncate text-lg font-medium">{e.name}</h3>
                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="size-3" />
                                        {e.area}
                                    </p>
                                </div>
                                <Badge variant={e.tone === "open" ? "default" : "secondary"}>
                                    {e.tone === "open" ? "Open" : "Watching"}
                                </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{e.status}</p>
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
                <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    How it works
                </h2>
                <div className="grid gap-8 sm:grid-cols-3">
                    {steps.map((s, i) => (
                        <div key={i} className="flex flex-col items-start">
                            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
                <p className="font-display">Built by a camper, for campers.</p>
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
