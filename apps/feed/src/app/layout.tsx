// =====================================================================
// 🏠 Root layout — apps/console (AUTH + HOME/FEED)
// =====================================================================
// 📖 Sert : /home (feed), /login, /library, /highlights, /billing,
//    /settings, /onboarding, /dashboard/*, /admin/*
//
// 🎯 Charge Tolgee, Theme, fonts. C'est la coquille globale.
// =====================================================================

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Geist } from 'next/font/google';
import { TolgeeNextProvider } from '@qoe/i18n/provider';
import { getTolgee, getLanguage, initI18n } from '@qoe/i18n/server';
import { TooltipProvider } from '@qoe/ui/ui/tooltip';
import { Toaster } from '@qoe/ui/ui/sonner';
import { AnalyticsScript } from '@qoe/analytics/client';
import { cn } from '@qoe/utils';
import { DevtoolsPanel, ThemeProvider, GlobalAuthModalProvider } from '@qoe/ui';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { getCurrentUser } from '@qoe/auth';
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
  const tolgee = await getTolgee();
  const staticData = await tolgee.loadRequired();
  const currentUser = await getCurrentUser().catch(() => null);

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
      suppressHydrationWarning
    >
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TolgeeNextProvider language={locale} staticData={staticData}>
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
          </TolgeeNextProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
