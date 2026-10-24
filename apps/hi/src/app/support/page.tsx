// =====================================================================
// 🎫 /support — centre d'aide (vitrine, sans compte requis)
// =====================================================================
// Points déjà traités (recherche + FAQ bilingue), liens vers les dossiers
// connectés, puis formulaire public (invité ou au compte si connecté sur
// hi). Le cas « compte perdu » : sans compte, on peut quand même demander.
// =====================================================================

import type { Metadata } from 'next';
import { URLS } from '@qoe/config';
import { HelpCenter } from './components/help-center';
import type { ManagedArticle } from './components/help-faq';

const landingUrl = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

export const metadata: Metadata = {
  title: "Centre d'aide & Support — qoefi",
  description:
    'Assistance, réponses immédiates (compte, confirmation, désabonnement, recours) et formulaire de contact direct avec l’équipe qoefi.',
  alternates: {
    canonical: `${landingUrl}/support`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    title: "Centre d'aide & Support — qoefi",
    description:
      'Assistance, réponses immédiates et formulaire de contact direct avec l’équipe qoefi.',
    url: `${landingUrl}/support`,
  },
  twitter: {
    card: 'summary',
    title: "Centre d'aide & Support — qoefi",
    description:
      'Assistance, réponses immédiates et formulaire de contact direct avec l’équipe qoefi.',
  },
};

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
        Aide / Help
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Centre d&apos;aide</h1>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        La plupart des demandes ont une réponse immédiate ci-dessous. Sinon, ouvrez un dossier en
        bas de page — <strong>sans créer de compte</strong>
        si besoin. Most requests are answered below; otherwise open a case.
      </p>
      <div className="mt-8">
        <HelpCenter appUrl={URLS.APP} managed={await getManagedArticles()} />
      </div>
    </main>
  );
}
