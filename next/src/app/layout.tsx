import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Inter, Big_Shoulders, Cormorant_Garamond, Source_Serif_4, DM_Mono, Caveat } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
    variable: "--font-poster",
    subsets: ["latin"],
    weight: ["500", "700", "800", "900"],
    adjustFontFallback: false,
});

const cormorant = Cormorant_Garamond({
    variable: "--font-italic-serif",
    subsets: ["latin"],
    style: ["normal", "italic"],
    weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
    variable: "--font-body-serif",
    subsets: ["latin"],
    style: ["normal", "italic"],
    weight: ["400", "600"],
});

const dmMono = DM_Mono({
    variable: "--font-mono-field",
    subsets: ["latin"],
    weight: ["400", "500"],
});

const caveat = Caveat({
    variable: "--font-hand",
    subsets: ["latin"],
    weight: ["400", "600"],
});

const SITE_URL = "https://campwatch.dev";
const SITE_TITLE = "CampWatch — Never Miss a Campsite Opening";
const SITE_DESCRIPTION =
    "Recreation.gov sells out in minutes. CampWatch watches the sites you actually want, every five minutes, and emails you the second one opens. No app, no notifications to babysit.";

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: SITE_TITLE,
        template: "%s · CampWatch",
    },
    description: SITE_DESCRIPTION,
    applicationName: "CampWatch",
    keywords: ["recreation.gov", "campsite alerts", "campground availability", "outdoors", "camping"],
    authors: [{ name: "Mike Roberts" }],
    creator: "Mike Roberts",
    icons: {
        icon: "/icon.svg",
    },
    openGraph: {
        type: "website",
        url: SITE_URL,
        siteName: "CampWatch",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: [
            {
                url: "/og-default.png",
                width: 1200,
                height: 630,
                alt: "CampWatch — campsite availability alerts for recreation.gov",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        images: ["/og-default.png"],
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/*
                  Polyfill esbuild's __name helper before next-themes' inline anti-flash
                  script runs. The script ships with `__name(fn, "name")` calls (a side
                  effect of keep-names minification) but the helper definition lives in a
                  later chunk that hasn't loaded yet at head-script time.
                */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: "window.__name=window.__name||function(t,n){try{Object.defineProperty(t,'name',{value:n,configurable:true})}catch(e){}return t};",
                    }}
                />
                {/*
                  Cloudflare Web Analytics — free, cookieless, GDPR-safe.
                  Get your beacon token from: Cloudflare dashboard → campwatch.dev →
                  Analytics & Logs → Web Analytics → Add a site. Then add it as the
                  NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN environment variable in the
                  Cloudflare Worker settings (Workers & Pages → campwatch → Settings →
                  Variables and Secrets). If the env var is absent the script is omitted.
                */}
                {process.env.NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN && (
                    <script
                        defer
                        src="https://static.cloudflareinsights.com/beacon.min.js"
                        data-cf-beacon={`{"token": "${process.env.NEXT_PUBLIC_CLOUDFLARE_BEACON_TOKEN}"}`}
                    />
                )}
            </head>
            <body
                className={`${inter.variable} ${GeistSans.variable} ${bigShoulders.variable} ${cormorant.variable} ${sourceSerif.variable} ${dmMono.variable} ${caveat.variable} font-sans antialiased`}
                suppressHydrationWarning
            >
                <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                    <TooltipProvider>
                        {children}
                        <Toaster richColors closeButton position="top-right" />
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
