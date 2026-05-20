import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import {
    Inter,
    Big_Shoulders,
    Cormorant_Garamond,
    Source_Serif_4,
    DM_Mono,
    Caveat,
} from "next/font/google";
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

export const metadata: Metadata = {
    title: "CampWatch — Never Miss a Campsite Opening",
    description: "Get instant alerts when campsites open up at the places you actually want to camp.",
    icons: {
        icon: "/icon.svg",
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
                        __html:
                            "window.__name=window.__name||function(t,n){try{Object.defineProperty(t,'name',{value:n,configurable:true})}catch(e){}return t};",
                    }}
                />
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
