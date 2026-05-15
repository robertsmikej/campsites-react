import Link from "next/link";
import { Tent, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <section className="container mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center">
                <Tent className="mb-6 size-12 text-emerald-600" aria-hidden />
                <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                    Never miss a campsite opening.
                </h1>
                <p className="mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
                    CampWatch checks recreation.gov every 15 minutes and emails you when sites you
                    want come available.
                </p>
                <div className="mt-8 flex gap-3">
                    <Button size="lg" asChild>
                        <Link href="/app">Open app</Link>
                    </Button>
                    <Button variant="outline" size="lg" asChild>
                        <Link href="/discover">Browse picks</Link>
                    </Button>
                </div>
            </section>

            <section className="container mx-auto grid max-w-4xl gap-4 px-6 pb-24 sm:grid-cols-3">
                <FeatureCard icon={<Tent />} title="Pick your campgrounds" body="Watch any site on recreation.gov." />
                <FeatureCard icon={<Bell />} title="Set your filters" body="Stay length, valid start days, favorite sites." />
                <FeatureCard icon={<Mail />} title="Get notified" body="Quiet, batched emails when openings appear." />
            </section>
        </main>
    );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
    return (
        <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
                <span className="text-emerald-600 [&>svg]:size-5">{icon}</span>
                <h3 className="text-base font-medium">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
        </Card>
    );
}
