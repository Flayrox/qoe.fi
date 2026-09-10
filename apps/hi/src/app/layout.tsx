// =====================================================================
// 🏝️ Root layout — apps/hi (PUBLIC SITE)
// =====================================================================

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Geist } from 'next/font/google';
import { I18nClientProvider } from '@qoe/i18n/provider';
import { getStaticTranslations, getLanguage, initI18n } from '@qoe/i18n/server';
import { cn } from '@qoe/utils';
import { AnalyticsScript } from '@qoe/analytics/client';
import { DevtoolsPanel, ThemeProvider, ThemeSeedScript } from '@qoe/ui';
import {
  getDevtoolsData,
  getEmbeddingDiagnosticAction,
  createMockUserAction,
  resetDatabaseAction,
  reindexAction,
  resetOnboardingAction,
  seedTopCompleteAction,
  seedTopProgressAction,
  simulateSubscriberAction,
  simulateFollowAction,
  simulateLikeAction,
  addMockFundsAction,
  impersonateLoginAction,
  logoutAction,
} from '@qoe/devtools';

// CSS global unifié — source unique dans @qoe/theme
import '@qoe/theme/styles';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const inter = Inter({ variable: '--font-body', subsets: ['latin'] });
const displayFont = Geist({ variable: '--font-classical', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'] });

const landingUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const title = isFr
    ? 'qoe.fi — L’infrastructure pour les créateurs et médias indépendants'
    : 'qoe.fi — The Independent Creator & Media Platform';

  const description = isFr
    ? 'Lancez votre publication, monétisez sans intermédiaire et développez votre lectorat sur une infrastructure européenne ouverte.'
    : 'Launch your publication, monetize directly, and grow your audience on open, Europe-hosted infrastructure.';

  return {
    metadataBase: new URL(landingUrl),
    title: {
      default: title,
      template: '%s | qoe.fi',
    },
    description,
    applicationName: 'qoe.fi',
    alternates: {
      canonical: landingUrl,
      languages: {
        'fr-FR': `${landingUrl}?lang=fr`,
        'en-US': `${landingUrl}?lang=en`,
        'x-default': landingUrl,
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      type: 'website',
      locale: isFr ? 'fr_FR' : 'en_US',
      alternateLocale: isFr ? ['en_US'] : ['fr_FR'],
      url: landingUrl,
      siteName: 'qoe.fi',
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      site: '@qoefi',
      creator: '@qoefi',
      title,
      description,
    },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    },
  };
}

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

  const devtoolsActions = {
    getDevtoolsData,
    embeddingDiagnosticAction: getEmbeddingDiagnosticAction,
    createMockUserAction,
    resetDatabaseAction,
    reindexAction,
    resetOnboardingAction,
    seedTopCompleteAction,
    seedTopProgressAction,
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
      <head />
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
        suppressHydrationWarning
      >
        {/* Script d'anti-FOUC du theme : next/script beforeInteractive est
            hoiste dans le <head> par Next au SSR, quel que soit l'emplacement.
            Place hors de <head> pour eviter le warning React 16
            "Encountered a script tag while rendering React component". */}
        <ThemeSeedScript />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <I18nClientProvider language={locale} staticData={staticData}>
            {children}
            {process.env.NODE_ENV === 'development' && <DevtoolsPanel actions={devtoolsActions} />}
          </I18nClientProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
