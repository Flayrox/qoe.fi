// =====================================================================
// 🏠 Root layout — apps/web (PUBLIC)
// =====================================================================
// 📖 Sert : /start (landing), /tenant/[domain], /article/[slug]
//    PAS d'auth requise. Tolgee + ThemeProvider uniquement.
//
// 📖 Note : jusqu'à la Phase 3 (migration console), on réutilise
//    le globals.css et les providers de l'ancien src/. C'est un
//    placeholder pour l'instant — le vrai layout autonome viendra
//    après la migration finale.
// =====================================================================

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TolgeeNextProvider } from "@qoe/i18n/provider";
import { getTolgee, getLanguage } from "@qoe/i18n/server";
import { TooltipProvider } from "@qoe/ui/primitives/tooltip";
import { cn } from "@qoe/utils";

// Ré-export du CSS global depuis l'ancien emplacement
import "../../../src/app/globals.css";

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
          <TolgeeNextProvider language={locale} staticData={staticData}>
            <TooltipProvider>{children}</TooltipProvider>
          </TolgeeNextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
