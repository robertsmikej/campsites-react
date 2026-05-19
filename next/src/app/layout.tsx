import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
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
            <body className={`${inter.variable} ${GeistSans.variable} font-sans antialiased`}>
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
