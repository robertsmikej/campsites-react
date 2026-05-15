import type { Metadata } from "next";
import { DiscoverList } from "@/components/discover-list";

export const metadata: Metadata = {
    title: "Browse picks — CampWatch",
    description: "Browse a curated list of campgrounds you can add to your CampWatch watchlist.",
};

export default function DiscoverPage() {
    return (
        <main className="container mx-auto max-w-5xl px-4 py-8 sm:py-12">
            <header className="mb-8 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Curated picks
                </p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Campgrounds the curator is watching
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                    These are the campgrounds on CampWatch&apos;s shared list. Sign in to add any of
                    them to your own watchlist.
                </p>
            </header>
            <DiscoverList />
        </main>
    );
}
