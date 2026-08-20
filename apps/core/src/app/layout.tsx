// =====================================================================
// 🏠 Root layout — apps/console (AUTH + HOME/FEED)
// =====================================================================
// 📖 Sert : /home (feed), /login, /library, /highlights, /billing,
//    /settings, /onboarding, /dashboard/*, /admin/*
//
// 🎯 Charge i18n, Theme, fonts. C'est la coquille globale.
// =====================================================================

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Geist } from 'next/font/google';
import { I18nClientProvider } from '@qoe/i18n/provider';
import { getStaticTranslations, initI18n } from '@qoe/i18n/server';
import { GrowthBookProvider } from '@qoe/flags';
import { getGrowthBookPayload } from '@qoe/flags/server';
import { TooltipProvider } from '@qoe/ui/ui/tooltip';
import { Toaster } from '@qoe/ui/ui/sonner';
import { AnalyticsScript } from '@qoe/analytics/client';
import { cn } from '@qoe/utils';
import { DevtoolsPanel, ThemeProvider, ThemeSeedScript, GlobalAuthModalProvider } from '@qoe/ui';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { getCurrentUser } from '@qoe/auth';
import { prisma } from '@qoe/db/client';
import {
  getDevtoolsData,
  createMockUserAction,
  generateMockFeedPostsAction,
  resetDatabaseAction,
  seedFullDatabaseAction,
  resetOnboardingAction,
  simulateSubscriberAction,
  simulateFollowAction,
  simulateLikeAction,
  addMockFundsAction,
  impersonateLoginAction,
  logoutAction,
} from '@qoe/db/devtools';

// CSS global unifié — source unique dans @qoe/theme
import '@qoe/theme/styles';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const inter = Inter({ variable: '--font-body', subsets: ['latin'] });
const displayFont = Geist({ variable: '--font-classical', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'qoe.fi — Your Digital Sanctuary in Europe',
  description:
    'A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await initI18n();
  const staticTranslations = await getStaticTranslations();
  const staticData = await staticTranslations.loadTranslations().catch(() => ({}));

  // Timeout de sécurité (800ms) pour éviter tout blocage du SSR si la session/DB tarde à répondre
  const userPromise = getCurrentUser().catch(() => null);
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 800));
  const currentUser = await Promise.race([userPromise, timeoutPromise]);

  const accountSettings = currentUser
    ? await prisma.userSettings
        .findUnique({
          where: { userId: currentUser.id },
          select: { fontScale: true, reduceMotion: true, highContrast: true },
        })
        .catch(() => null)
    : null;
  const flagsPayload = await getGrowthBookPayload().catch(() => ({}));

  const devtoolsActions = {
    getDevtoolsData,
    createMockUserAction,
    generateMockFeedPostsAction,
    resetDatabaseAction,
    seedFullDatabaseAction,
    resetOnboardingAction,
    simulateSubscriberAction,
    simulateFollowAction,
    simulateLikeAction,
    addMockFundsAction,
    impersonateLoginAction,
    logoutAction,
  };

  return (
    <html
      lang={locale}
      className={cn('scroll-smooth', 'font-sans', geist.variable)}
      data-qoe-reduce-motion={accountSettings?.reduceMotion ? 'true' : 'false'}
      data-qoe-high-contrast={accountSettings?.highContrast ? 'true' : 'false'}
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
        style={{ fontSize: `${accountSettings?.fontScale ?? 100}%` }}
      >
        <ThemeSeedScript />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <GrowthBookProvider payload={flagsPayload}>
            <I18nClientProvider language={locale} staticData={staticData}>
              <QueryProvider>
                <GlobalAuthModalProvider isAuthenticated={!!currentUser}>
                  <TooltipProvider>
                    {children}
                    <Toaster />
                    {process.env.NODE_ENV === 'development' && (
                      <DevtoolsPanel actions={devtoolsActions} />
                    )}
                  </TooltipProvider>
                </GlobalAuthModalProvider>
              </QueryProvider>
            </I18nClientProvider>
          </GrowthBookProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
