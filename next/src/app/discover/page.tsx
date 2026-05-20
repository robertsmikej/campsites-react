import type { Metadata } from "next";
import { DiscoverClient } from "./discover-client";

export const metadata: Metadata = {
    title: "Browse the Curator's List — CampWatch",
    description:
        "See the campgrounds CampWatch is watching. Sign in to build your own watchlist and get instant availability alerts.",
};

export default function DiscoverPage() {
    return <DiscoverClient />;
}
