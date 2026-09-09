import type { Metadata, Viewport } from "next";
import {
    Inter,
    Geist,
    Big_Shoulders,
    Cormorant_Garamond,
    Source_Serif_4,
    DM_Mono,
    Caveat,
} from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter and Geist back the shadcn UI (dialogs, buttons, account, admin). The
// marketing pages render no text in them, so they are not preloaded: the
// browser fetches them only when a page actually uses the face.
const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
    preload: false,
});

const geist = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
    preload: false,
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
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "CampWatch", statusBarStyle: "default" },
    icons: {
        icon: "/icon.svg",
        apple: "/apple-touch-icon.png",
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

export const viewport: Viewport = {
    themeColor: "#1F3D2A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
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
                className={`${inter.variable} ${geist.variable} ${bigShoulders.variable} ${cormorant.variable} ${sourceSerif.variable} ${dmMono.variable} ${caveat.variable} font-sans antialiased`}
            >
                <TooltipProvider>
                    {children}
                    <Toaster richColors closeButton position="top-right" />
                </TooltipProvider>
            </body>
        </html>
    );
}
