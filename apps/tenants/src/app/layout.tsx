// =====================================================================
// 🏠 Root layout — apps/tenants (PUBLIC)
// =====================================================================

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Geist, Newsreader } from 'next/font/google';
import { I18nClientProvider } from '@qoe/i18n/provider';
import { getStaticTranslations, getLanguage, initI18n } from '@qoe/i18n/server';
import { cn } from '@qoe/utils';
import { DevtoolsPanel, ThemeProvider, ThemeSeedScript, GlobalAuthModalProvider } from '@qoe/ui';
import { getCurrentUser } from '@qoe/auth';
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
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  style: ['normal', 'italic'],
});

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  return {
    title: isFr
      ? 'qoefi — Publications et blogs indépendants'
      : 'qoefi — Independent Publications & Blogs',
    description: isFr
      ? 'Découvrez les publications, articles et réflexions de créateurs indépendants propulsés par qoefi.'
      : 'Discover publications, articles, and insights from independent creators powered by qoefi.',
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
  const currentUser = await getCurrentUser().catch(() => null);
  // staticData peut être vide en dev
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
      className={cn('scroll-smooth', 'font-sans', geist.variable, newsreader.variable)}
      suppressHydrationWarning
    >
      <head>
        <ThemeSeedScript />
      </head>
      <body
        className={`${inter.variable} ${displayFont.variable} ${jetbrainsMono.variable} ${newsreader.variable} antialiased selection:bg-primary selection:text-primary-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <I18nClientProvider language={locale} staticData={staticData}>
            <GlobalAuthModalProvider isAuthenticated={!!currentUser}>
              {children}
              {process.env.NODE_ENV === 'development' && (
                <DevtoolsPanel actions={devtoolsActions} />
              )}
            </GlobalAuthModalProvider>
          </I18nClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
