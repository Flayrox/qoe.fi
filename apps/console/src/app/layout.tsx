// =====================================================================
// 🏠 Root layout — apps/console (AUTH + HOME/FEED)
// =====================================================================
// 📖 Sert : /home (feed), /login, /library, /highlights, /billing,
//    /settings, /onboarding, /dashboard/*, /admin/*
//
// 🎯 Charge Tolgee, Theme, fonts. C'est la coquille globale.
// =====================================================================

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { TolgeeNextProvider } from "@qoe/i18n/provider";
import { getTolgee, getLanguage } from "@qoe/i18n/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsScript } from "@qoe/analytics/client";
import { cn } from "@qoe/utils";

// Ré-export du CSS global depuis l'ancien emplacement
// (sera migré physiquement en Phase 8)
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const inter = Inter({ variable: "--font-body", subsets: ["latin"] });
const displayFont = Geist({ variable: "--font-classical", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "qoe.fi — Your Digital Sanctuary in Europe",
  description:
    "A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLanguage();
  const tolgee = await getTolgee();
  const staticData = await tolgee.loadRequired();

  return (
    <html lang={locale} className={cn("scroll-smooth", "font-sans", geist.variable)} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TolgeeNextProvider language={locale} staticData={staticData as any}>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </TolgeeNextProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
