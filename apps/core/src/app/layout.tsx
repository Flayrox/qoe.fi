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
import { TooltipProvider } from '@qoe/ui/ui/tooltip';
import { Toaster } from '@qoe/ui/toast';
import { AnalyticsScript } from '@qoe/analytics/client';
import { cn } from '@qoe/utils';
import {
  DevtoolsPanel,
  ThemeProvider,
  ThemeSeedScript,
  GlobalAuthModalProvider,
  InvertedCurveBanner,
} from '@qoe/ui';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ReadingPreferencesProvider } from '@/components/providers/ReadingPreferencesProvider';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
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

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'qoe.fi — Your Digital Sanctuary in Europe',
    template: '%s | qoe.fi',
  },
  description:
    'A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.',
  applicationName: 'qoe.fi',
  authors: [{ name: 'qoe.fi', url: 'https://qoe.fi' }],
  creator: 'qoe.fi',
  publisher: 'qoe.fi',
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
    locale: 'fr_FR',
    alternateLocale: ['en_US'],
    url: appUrl,
    siteName: 'qoe.fi',
    title: 'qoe.fi — Your Digital Sanctuary in Europe',
    description:
      'A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@qoefi',
    creator: '@qoefi',
    title: 'qoe.fi — Your Digital Sanctuary in Europe',
    description:
      'A sophisticated platform for modern creators. Retain your revenue, automate compliance, and grow your audience within a secure, GDPR-first ecosystem.',
  },
  verification: {
    google: '5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await initI18n();
  const staticTranslations = await getStaticTranslations();
  const staticData = await staticTranslations.loadTranslations().catch(() => ({}));

  // Session Supabase (auth uniquement — plus aucun accès Prisma).
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  // Préférences lecteur : Go (GET /v1/settings/preferences) — utilisé pour le
  // thème d'accessibilité (SSR). Erreur Go → défauts (le thème reste sain).
  const accountSettings = currentUser
    ? await goFetch<{
        fontScale: number;
        reduceMotion: boolean;
        highContrast: boolean;
        autoplayMedia: boolean;
      }>('/v1/settings/preferences').catch(() => null)
    : null;

  // 📣 Annonce globale diffusée depuis l'admin (courbure inversée)
  let globalAnnouncement: {
    id: string;
    message: string;
    type?: 'promo' | 'info' | 'warning' | 'critical';
    linkUrl?: string;
    linkText?: string;
  } | null = null;
  try {
    const { data: configRow } = await supabase
      .from('SystemConfig')
      .select('value')
      .eq('key', 'GLOBAL_ANNOUNCEMENT')
      .maybeSingle();

    if (configRow?.value) {
      const parsed = JSON.parse(configRow.value);
      if (parsed?.active && parsed?.message) {
        globalAnnouncement = parsed;
      }
    }
  } catch {
    // Fail-safe gracieux
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
      data-qoe-reduce-motion={accountSettings?.reduceMotion ? 'true' : 'false'}
      data-qoe-high-contrast={accountSettings?.highContrast ? 'true' : 'false'}
      suppressHydrationWarning
    >
      <head />
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
        style={{ fontSize: `${accountSettings?.fontScale ?? 100}%` }}
        suppressHydrationWarning
      >
        {/* Script d'anti-FOUC du thème : next/script beforeInteractive est
            hoisté dans le <head> par Next au SSR, quel que soit l'emplacement.
            Placé hors de <head> pour éviter le warning React 16
            "Encountered a script tag while rendering React component". */}
        <ThemeSeedScript />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <I18nClientProvider language={locale} staticData={staticData}>
            <QueryProvider>
              <ReadingPreferencesProvider initial={accountSettings}>
                <GlobalAuthModalProvider isAuthenticated={!!currentUser}>
                  <TooltipProvider>
                    {globalAnnouncement && (
                      <InvertedCurveBanner
                        id={globalAnnouncement.id}
                        message={globalAnnouncement.message}
                        type={globalAnnouncement.type}
                        linkUrl={globalAnnouncement.linkUrl}
                        linkText={globalAnnouncement.linkText}
                      />
                    )}
                    {children}
                    <Toaster />
                    {process.env.NODE_ENV === 'development' && (
                      <DevtoolsPanel actions={devtoolsActions} />
                    )}
                  </TooltipProvider>
                </GlobalAuthModalProvider>
              </ReadingPreferencesProvider>
            </QueryProvider>
          </I18nClientProvider>
        </ThemeProvider>

        <AnalyticsScript />
      </body>
    </html>
  );
}
