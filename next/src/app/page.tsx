"use client";

import { useAuth } from "@/hooks/use-auth";
import { C, FB } from "@/components/field-notes/tokens";
import { StatsProvider } from "@/contexts/stats-context";
import { Hero } from "@/components/homepage/hero";
import { StatsBand } from "@/components/homepage/stats-band";
import { WatchlistPostcard } from "@/components/homepage/watchlist-postcard";
import { CampgroundLookup } from "@/components/campground-lookup";
import { HowItWorks } from "@/components/homepage/how-it-works";
import { EmailLetter } from "@/components/homepage/email-letter";
import { Faq } from "@/components/homepage/faq";
import { Footer } from "@/components/homepage/footer";

export default function HomePage() {
    const auth = useAuth();
    return (
        <StatsProvider>
            <div
                style={{
                    width: "100%",
                    minHeight: "100%",
                    background: C.paper,
                    color: C.ink,
                    fontFamily: FB,
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <Hero auth={auth} />
                <StatsBand />
                <WatchlistPostcard />
                {/* ====== CAMPGROUND LOOKUP ====== */}
                <CampgroundLookup />
                <HowItWorks />
                <EmailLetter auth={auth} />
                <Faq />
                <Footer />
            </div>
        </StatsProvider>
    );
}
