// =====================================================================
// 🎫 /support — centre d'aide (vitrine, sans compte requis)
// =====================================================================
// Points déjà traités (recherche + FAQ bilingue), liens vers les dossiers
// connectés, puis formulaire public (invité ou au compte si connecté sur
// hi). Le cas « compte perdu » : sans compte, on peut quand même demander.
// =====================================================================

import type { Metadata } from 'next';
import { t } from '@lingui/core/macro';
import { URLS } from '@qoe/config';
import { getLanguage } from '@qoe/i18n/server';
import { HelpCenter } from './components/help-center';
import type { ManagedArticle } from './components/help-faq';

const landingUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

// Métadonnées rendues hors du provider i18n : la langue est lue directement,
// les deux variantes restent littérales (même règle que le layout).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) !== 'en';
  const title = isFr ? "Centre d'aide & Support — qoefi" : 'Help Center & Support — qoefi';
  const description = isFr
    ? 'Assistance, réponses immédiates (compte, confirmation, désabonnement, recours) et formulaire de contact direct avec l’équipe qoefi.'
    : 'Support, immediate answers (account, confirmation, unsubscribe, appeals) and a direct contact form for the qoefi team.';

  return {
    title,
    description,
    alternates: {
      canonical: `${landingUrl}/support`,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${landingUrl}/support`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// Articles gérés (console staff) : publiés, ordre voulu. Injoignable =
// tableau vide → le statique versionné prend le relais (repli, jamais vide).
async function getManagedArticles(): Promise<ManagedArticle[]> {
  try {
    const res = await fetch(`${process.env.QOE_API_URL}/v1/support/articles`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: ManagedArticle[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export default async function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {t`Aide`}
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{t`Centre d'aide`}</h1>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        {t`La plupart des demandes ont une réponse immédiate ci-dessous. Sinon, ouvrez un dossier en bas de page —`}{' '}
        <strong>{t`sans créer de compte`}</strong>
        {t` si besoin.`}
      </p>
      <div className="mt-8">
        <HelpCenter appUrl={URLS.APP} managed={await getManagedArticles()} />
      </div>
    </main>
  );
}
