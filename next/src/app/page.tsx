import Link from "next/link";
import { Tent, CalendarRange, Mail, ArrowRight, MapPin, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
    return (
        <main className="bg-background text-foreground">
            <Hero />
            <StatsBand />
            <DashboardPreview />
            <HowItWorks />
            <ExampleEmail />
            <FAQ />
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

            <div className="container mx-auto flex max-w-4xl flex-col items-start px-6 py-20 sm:py-32 md:py-40">
                <Tent className="mb-6 size-12 text-primary" aria-hidden />
                <h1 className="font-display text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                    Never miss a campsite opening at{" "}
                    <span className="text-accent">your favorite spots.</span>
                </h1>
                <p className="mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
                    CampWatch checks recreation.gov every 5 minutes and emails you the moment a site
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

function StatsBand() {
    return (
        <section className="border-y bg-muted/30">
            <div className="container mx-auto max-w-5xl px-6 py-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:divide-x sm:divide-border">
                    <div className="text-center sm:px-6">
                        <div className="font-display text-4xl font-light tracking-tight text-primary tabular-nums">5 min</div>
                        <div className="text-xs text-muted-foreground">Polling cadence</div>
                    </div>
                    <div className="text-center sm:px-6">
                        <div className="font-display text-4xl font-light tracking-tight text-primary tabular-nums">Email</div>
                        <div className="text-xs text-muted-foreground">The moment a site opens</div>
                    </div>
                    <div className="text-center sm:px-6">
                        <div className="font-display text-4xl font-light tracking-tight text-primary tabular-nums">Free</div>
                        <div className="text-xs text-muted-foreground">Forever. Built as a hobby.</div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ── MiniStrip ────────────────────────────────────────────────────────────────
// Renders a 60-bar static availability strip for the dashboard preview mock.
// Each tier drives a color and height; no interactivity needed.

type Tier = "favorite" | "worthwhile" | "low" | "none";

function MiniStrip({ tiers }: { tiers: Tier[] }) {
    return (
        <div className="flex h-7 items-end gap-px rounded bg-muted/40 p-1">
            {tiers.map((tier, i) => {
                const color =
                    tier === "favorite"
                        ? "bg-green-600"
                        : tier === "worthwhile"
                        ? "bg-yellow-500"
                        : tier === "low"
                        ? "bg-primary/30"
                        : "bg-muted-foreground/10";
                const height =
                    tier === "favorite" ? "90%" : tier === "worthwhile" ? "70%" : tier === "low" ? "40%" : "10%";
                return (
                    <div
                        key={i}
                        className={`flex-1 rounded-sm ${color}`}
                        style={{ height }}
                        aria-hidden
                    />
                );
            })}
        </div>
    );
}

// Three hand-crafted 60-tick strips
function makeTiers(pattern: string): Tier[] {
    return pattern.split("").map((c) => {
        if (c === "F") return "favorite";
        if (c === "W") return "worthwhile";
        if (c === "L") return "low";
        return "none";
    }) as Tier[];
}

// Outlet: lots of favorites mid-strip, a few worthwhile, rest none
const OUTLET_TIERS = makeTiers(
    "nnnnnnFFFFnnnnWWnnnnFFFFFFnnnnnnWWWnnnnFFFFFFFFnnWWnnnnnnWWFFFFnnnn"
        .slice(0, 60),
);
// Pine Flats: sparse — one small worthwhile cluster, some lows, mostly none
const PINE_TIERS = makeTiers(
    "nnnnnnnnLLnnnnnnWWWnnnnnnnnnnnnLLLLnnnnnnnnnWnnnnnLLLnnnnnnnnnnnn"
        .slice(0, 60),
);
// Stanley Lake: watching — no favorites, mix of low signals
const STANLEY_TIERS = makeTiers(
    "nnnnnnnnnnLnnnnnnnnnnnLLnnnnnnnnnnnnLnnnnnnnnnnnnnLLLnnnnnnnnnnnn"
        .slice(0, 60),
);

function DashboardPreview() {
    const rows = [
        {
            image: "/images/sites/outlet_campground_map.jpg",
            name: "Outlet Campground",
            area: "Redfish Lake, ID",
            badge: "3 nights open",
            badgeOpen: true,
            tiers: OUTLET_TIERS,
        },
        {
            image: "/images/sites/point_campground.jpeg",
            name: "Pine Flats",
            area: "Lowman, ID",
            badge: "1 night open",
            badgeOpen: true,
            tiers: PINE_TIERS,
        },
        {
            image: "/images/sites/stanley_lake_campground_map.jpg",
            name: "Stanley Lake",
            area: "Stanley, ID",
            badge: "Watching",
            badgeOpen: false,
            tiers: STANLEY_TIERS,
        },
    ];

    return (
        <section className="container mx-auto max-w-5xl px-6 py-20">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                What your dashboard looks like
            </p>
            <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Your watchlist, one glance
            </h2>

            {/* Mock dashboard card */}
            <div className="rounded-2xl border bg-card p-3 shadow-xl sm:p-4">
                {/* Fake browser chrome */}
                <div className="mb-3 flex items-center gap-2 px-1">
                    <div className="flex gap-1.5" aria-hidden>
                        <div className="size-2.5 rounded-full bg-muted-foreground/20" />
                        <div className="size-2.5 rounded-full bg-muted-foreground/20" />
                        <div className="size-2.5 rounded-full bg-muted-foreground/20" />
                    </div>
                    <div className="flex-1 rounded bg-muted/50 px-3 py-1 text-center text-[10px] text-muted-foreground/60">
                        campwatch.app/app
                    </div>
                </div>

                {/* Rows */}
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div
                            key={row.name}
                            className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/30 hover:shadow-sm"
                        >
                            {/* Thumbnail */}
                            <div
                                className="size-12 shrink-0 overflow-hidden rounded-md bg-muted bg-cover bg-center"
                                style={{ backgroundImage: `url(${row.image})` }}
                                aria-hidden
                            />

                            {/* Name + area */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="truncate font-display text-base font-semibold leading-tight">
                                        {row.name}
                                    </h3>
                                    <Badge
                                        variant={row.badgeOpen ? "default" : "secondary"}
                                        className="shrink-0 text-[10px]"
                                    >
                                        {row.badge}
                                    </Badge>
                                </div>
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                    <MapPin className="size-3" aria-hidden />
                                    {row.area}
                                </p>
                            </div>

                            {/* Availability strip — hidden on small mobile */}
                            <div className="hidden flex-1 max-w-xs sm:block">
                                <MiniStrip tiers={row.tiers} />
                            </div>

                            {/* Chevron */}
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </div>
                    ))}
                </div>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
                Color-coded by your ratings — favorites in green, worthwhile in yellow.
            </p>
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

function ExampleEmail() {
    return (
        <section className="container mx-auto max-w-5xl px-6 py-20">
            <div className="grid gap-10 sm:grid-cols-2 sm:items-center">
                <div>
                    <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        You get an email like this
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        One email per cycle when a site you care about opens. Direct links to book on recreation.gov. Unsubscribe with one click.
                    </p>
                </div>
                <div className="rounded-lg border bg-card p-6 shadow-md">
                    <div className="border-b pb-3">
                        <p className="text-xs text-muted-foreground">From</p>
                        <p className="text-sm font-medium">CampWatch &lt;alerts@campwatch.app&gt;</p>
                        <p className="mt-2 text-xs text-muted-foreground">Subject</p>
                        <p className="text-sm font-medium">2 new openings — Outlet, Pine Flats</p>
                    </div>
                    <div className="space-y-4 pt-4 text-sm">
                        <div>
                            <p className="font-medium">🏕 Outlet Campground · Site 015</p>
                            <p className="text-muted-foreground">Fri–Sun, May 23–25 (2 nights)</p>
                            <a href="#" className="text-primary underline-offset-2 hover:underline">Book on recreation.gov →</a>
                        </div>
                        <div>
                            <p className="font-medium">🏕 Pine Flats · Site 008</p>
                            <p className="text-muted-foreground">Sat, Jun 6 (1 night)</p>
                            <a href="#" className="text-primary underline-offset-2 hover:underline">Book on recreation.gov →</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

const faqs = [
    {
        q: "How does CampWatch know when a site opens?",
        a: "It polls recreation.gov every 5 minutes for the campgrounds in your watchlist and compares each cycle's availability to what it saw before. New openings trigger an email.",
    },
    {
        q: "Is it really free?",
        a: "Yes. It's a side project, not a business. Hosted on Cloudflare and GitHub Actions free tiers. No paid features planned.",
    },
    {
        q: "Why Google sign-in only?",
        a: "Simpler than maintaining a password system, and lets the notifier know who to email. Your address is never used for anything else.",
    },
    {
        q: "Can I add any recreation.gov campground?",
        a: "Yes. Once signed in, paste the campground ID from its recreation.gov URL into the configure dialog. Your watchlist is yours.",
    },
];

function FAQ() {
    return (
        <section className="border-t bg-muted/30 py-16 sm:py-20">
            <div className="container mx-auto max-w-3xl px-6">
                <h2 className="mb-10 text-center font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                    Common questions
                </h2>
                <div className="space-y-8">
                    {faqs.map((f) => (
                        <div key={f.q}>
                            <h3 className="font-display text-lg font-medium">{f.q}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
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
                <p className="text-xs">Checking every 5 minutes since 2026.</p>
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
