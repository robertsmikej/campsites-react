import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "CampWatch — Never Miss a Campsite Opening",
    description:
        "Get instant alerts when campsites open up at the places you actually want to camp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.variable} font-sans`}>
                <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                    <TooltipProvider>
                        {children}
                        <Toaster richColors closeButton />
                    </TooltipProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
