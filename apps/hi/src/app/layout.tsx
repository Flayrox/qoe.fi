// =====================================================================
// 🏝️ Root layout — apps/hi (PUBLIC SITE)
// =====================================================================

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Geist } from 'next/font/google';
import { I18nClientProvider } from '@qoe/i18n/provider';
import { getStaticTranslations, getLanguage, initI18n } from '@qoe/i18n/server';
import { GrowthBookProvider } from '@qoe/flags';
import { getGrowthBookPayload } from '@qoe/flags/server';
import { cn } from '@qoe/utils';
import { AnalyticsScript } from '@qoe/analytics/client';
import { DevtoolsPanel, ThemeProvider, ThemeSeedScript } from '@qoe/ui';
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
  let staticData: Record<string, unknown> = {};
  try {
    staticData = (await staticTranslations.loadTranslations()) ?? {};
  } catch {
    staticData = {};
  }

  const flagsPayload = await getGrowthBookPayload();

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
        <ThemeSeedScript />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <GrowthBookProvider payload={flagsPayload}>
            <I18nClientProvider language={locale} staticData={staticData}>
              {children}
              {process.env.NODE_ENV === 'development' && (
                <DevtoolsPanel actions={devtoolsActions} />
              )}
            </I18nClientProvider>
          </GrowthBookProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
