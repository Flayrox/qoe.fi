import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TolgeeNextProvider } from "@/tolgee/client";
import { getTolgee } from "@/tolgee/server";
import { getLanguage } from "@/tolgee/language";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Geist({
  variable: "--font-classical",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QOE.FI | Your Digital Sanctuary in Europe",
  description: "A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.",
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
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </TolgeeNextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
