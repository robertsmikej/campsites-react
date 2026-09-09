import type { Metadata } from "next";
import { DiscoverClient } from "./discover-client";

const DESCRIPTION =
    "See the campgrounds CampWatch is watching. Sign in to build your own watchlist and get instant availability alerts.";

// The root layout's title template appends "· CampWatch".
export const metadata: Metadata = {
    title: "Browse the Curator's List",
    description: DESCRIPTION,
    alternates: { canonical: "/discover" },
    openGraph: {
        url: "/discover",
        title: "Browse the Curator's List · CampWatch",
        description: DESCRIPTION,
    },
};

export default function DiscoverPage() {
    return <DiscoverClient />;
}
