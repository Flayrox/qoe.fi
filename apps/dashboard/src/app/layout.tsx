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
import { TolgeeNextProvider } from "@qoe/i18n/provider";
import { getTolgee, getLanguage } from "@qoe/i18n/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsScript } from "@qoe/analytics/client";
import { cn } from "@qoe/utils";
import { DevtoolsPanel, ThemeProvider } from "@qoe/ui";
import {
  getDevtoolsData,
  createMockUserAction,
  generateMockFeedPostsAction,
  resetDatabaseAction,
  resetOnboardingAction,
  simulateSubscriberAction,
  simulateFollowAction,
  simulateLikeAction,
  addMockFundsAction
} from "@qoe/ui/devtools-actions";

// CSS global unifié — source unique dans @qoe/theme
import "@qoe/theme/styles";

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

  const devtoolsActions = {
    getDevtoolsData,
    createMockUserAction,
    generateMockFeedPostsAction,
    resetDatabaseAction,
    resetOnboardingAction,
    simulateSubscriberAction,
    simulateFollowAction,
    simulateLikeAction,
    addMockFundsAction
  };

  return (
    <html lang={locale} className={cn("scroll-smooth", "font-sans", geist.variable)} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TolgeeNextProvider language={locale} staticData={staticData as any}>
            <TooltipProvider>
              {children}
              <Toaster />
              {process.env.NODE_ENV === "development" && <DevtoolsPanel actions={devtoolsActions} />}
            </TooltipProvider>
          </TolgeeNextProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
