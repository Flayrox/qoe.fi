import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { getLanguage } from '@qoe/i18n/server';
import { fetchLegalDocuments } from '@qoe/sdk/actions/legal';
import { CookiePreferencesButton } from '@qoe/ui';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  legal: { fr: 'Juridique', en: 'Legal' },
  privacy: { fr: 'Vie privée', en: 'Privacy' },
  commerce: { fr: 'Paiements', en: 'Billing' },
  creator: { fr: 'Créateurs', en: 'Creators' },
  security: { fr: 'Sécurité', en: 'Security' },
  general: { fr: 'Informations', en: 'Information' },
};

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = !lang.startsWith('en');
  return {
    title: isFr ? 'Informations légales | qoefi' : 'Legal information | qoefi',
    description: isFr
      ? 'Conditions générales, confidentialité, cookies et informations légales de la plateforme qoefi.'
      : 'Terms of service, privacy, cookies and legal information for the qoefi platform.',
    alternates: { canonical: 'https://qoe.fi/legal' },
    robots: { index: true, follow: true },
  };
}

export default async function LegalIndexPage() {
  const locale = await getLanguage();
  const isFr = !locale.startsWith('en');
  const documents = await fetchLegalDocuments(locale);

  const grouped = new Map<string, typeof documents>();
  for (const doc of documents) {
    const list = grouped.get(doc.category) ?? [];
    list.push(doc);
    grouped.set(doc.category, list);
  }

  const categoryLabel = (category: string) =>
    CATEGORY_LABELS[category]?.[isFr ? 'fr' : 'en'] ?? category;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {isFr ? 'Informations légales' : 'Legal information'}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {isFr
            ? 'Toutes les règles du service, en clair : ce que qoefi s’engage à faire, ce que vous acceptez, comment vos données sont traitées et comment exercer vos droits. Chaque document est versionné et l’historique reste consultable.'
            : 'Every rule of the service, in plain language: what qoefi commits to, what you accept, how your data is processed and how to exercise your rights. Each document is versioned and its history stays available.'}
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {[...grouped.entries()].map(([category, docs]) => (
          <section key={category}>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {categoryLabel(category)}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/legal/${doc.slug}`}
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
                        {isFr ? 'Version' : 'Version'} {doc.version}
                        {doc.effectiveAt
                          ? ` · ${isFr ? 'en vigueur le' : 'effective'} ${new Date(
                              doc.effectiveAt
                            ).toLocaleDateString(isFr ? 'fr-FR' : 'en-GB')}`
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
            {isFr
              ? 'Les documents légaux sont en cours de publication.'
              : 'Legal documents are being published.'}
          </p>
        )}
      </div>

      <section className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">
          {isFr ? 'Vos préférences de cookies' : 'Your cookie preferences'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isFr
            ? 'Vous pouvez revenir sur votre choix concernant les traceurs non essentiels à tout moment.'
            : 'You can change your choice about non-essential trackers at any time.'}
        </p>
        <div className="mt-4">
          <CookiePreferencesButton label={isFr ? 'Gérer mes cookies' : 'Manage my cookies'} />
        </div>
      </section>
    </div>
  );
}
