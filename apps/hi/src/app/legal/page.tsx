// =====================================================================
// ⚖️ Sommaire des documents légaux — apps/hi (hi.qoe.fi)
// =====================================================================
// La vitrine publique est la SEULE à héberger les pages légales de la
// plateforme : les tenants et l'app lecteur y renvoient par un lien
// absolu (voir `getLegalDocumentUrl` dans @qoe/config).
// =====================================================================

import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { getLanguage } from '@qoe/i18n/server';
import { fetchLegalDocuments } from '@qoe/sdk/actions/legal';
import { CookiePreferencesButton } from '@qoe/ui';
import { toPublicLegalSlug } from '@qoe/config/legal';
import { getCategoryLabel } from '@/lib/legal-categories';

export const dynamic = 'force-dynamic';

const LANDING_URL = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://hi.qoe.fi').replace(/\/$/, '');

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = !lang.startsWith('en');
  return {
    title: isFr ? 'Informations légales | qoefi' : 'Legal Information | qoefi',
    description: isFr
      ? 'Conditions générales, confidentialité, cookies et informations légales de la plateforme qoefi.'
      : 'Terms of service, privacy, cookies and legal information for the qoefi platform.',
    alternates: { canonical: `${LANDING_URL}/legal` },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: isFr ? 'Informations légales | qoefi' : 'Legal Information | qoefi',
      description: isFr
        ? 'Règles du service, politique de confidentialité, RGPD et engagements de la plateforme qoefi.'
        : 'Terms of service, privacy policy, GDPR compliance and commitments of the qoefi platform.',
      url: `${LANDING_URL}/legal`,
    },
    twitter: {
      card: 'summary',
      title: isFr ? 'Informations légales | qoefi' : 'Legal Information | qoefi',
      description: isFr
        ? 'Règles du service et conformité légale de la plateforme qoefi.'
        : 'Terms of service and legal compliance for the qoefi platform.',
    },
  };
}
export default async function LegalIndexPage() {
  const locale = await getLanguage();
  const isFr = !locale.startsWith('en');
  // La vitrine ne doit jamais tomber parce que l'API est indisponible :
  // on affiche alors simplement l'état « en cours de publication ».
  const documents = await fetchLegalDocuments(locale).catch(() => []);

  const grouped = new Map<string, typeof documents>();
  for (const doc of documents) {
    const list = grouped.get(doc.category) ?? [];
    list.push(doc);
    grouped.set(doc.category, list);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 lg:px-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t`Informations légales`}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t`Toutes les règles du service, en clair : ce que qoefi s’engage à faire, ce que vous acceptez, comment vos données sont traitées et comment exercer vos droits. Chaque document est versionné et l’historique reste consultable.`}
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {[...grouped.entries()].map(([category, docs]) => (
          <section key={category}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {getCategoryLabel(category)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/legal/${toPublicLegalSlug(doc.slug)}`}
                  className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug group-hover:text-primary">
                        {doc.title}
                      </h3>
                      {doc.summary && (
                        <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">
                          {doc.summary}
                        </p>
                      )}
                      <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t`Version`} {doc.version}
                        {doc.effectiveAt
                          ? ` · ${t`en vigueur le`} ${new Date(doc.effectiveAt).toLocaleDateString(
                              isFr ? 'fr-FR' : 'en-GB'
                            )}`
                          : ''}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {documents.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
            {t`Les documents légaux sont en cours de publication.`}
          </p>
        )}
      </div>

      <section className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{t`Vos préférences de cookies`}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t`Vous pouvez revenir sur votre choix concernant les traceurs non essentiels à tout moment.`}
        </p>
        <div className="mt-4">
          <CookiePreferencesButton label={t`Gérer mes cookies`} />
        </div>
      </section>
    </div>
  );
}
