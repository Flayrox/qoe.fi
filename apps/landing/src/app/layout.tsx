// =====================================================================
// 🏝️ Root layout — apps/landing (PUBLIC SITE)
// =====================================================================

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import { TolgeeNextProvider } from "@qoe/i18n/provider";
import { getTolgee, getLanguage } from "@qoe/i18n/server";
import { cn } from "@qoe/utils";
import { DevtoolsPanel, ThemeProvider } from "@qoe/ui";

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
  let staticData: any = {};
  try {
    staticData = (await tolgee.loadRequired()) ?? {};
  } catch {
    staticData = {};
  }

  return (
    <html lang={locale} className={cn("scroll-smooth", "font-sans", geist.variable)} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TolgeeNextProvider language={locale} staticData={staticData}>
            {children}
            {process.env.NODE_ENV === "development" && <DevtoolsPanel />}
          </TolgeeNextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
