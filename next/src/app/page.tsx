"use client";

import { useAuth } from "@/hooks/use-auth";
import { StatsProvider } from "@/contexts/stats-context";
import { AuthErrorToast } from "@/components/auth-error-toast";
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
            <AuthErrorToast />
            <div className="w-full min-h-full bg-cw-paper text-cw-ink font-body-serif relative overflow-hidden">
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
