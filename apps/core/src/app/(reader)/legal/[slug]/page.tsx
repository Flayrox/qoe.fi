import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, History } from 'lucide-react';
import { markdownHeadings, markdownToHtml } from '@qoe/utils';
import { getLanguage } from '@qoe/i18n/server';
import { JsonLd } from '@qoe/ui';
import { CookiePreferencesButton } from '@qoe/ui';
import {
  fetchLegalDocument,
  fetchLegalDocuments,
  fetchLegalVersions,
} from '@qoe/sdk/actions/legal';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  legal: { fr: 'Juridique', en: 'Legal' },
  privacy: { fr: 'Vie privée', en: 'Privacy' },
  commerce: { fr: 'Paiements', en: 'Billing' },
  creator: { fr: 'Créateurs', en: 'Creators' },
  security: { fr: 'Sécurité', en: 'Security' },
  general: { fr: 'Informations', en: 'Information' },
};

function formatDate(value: string | undefined, isFr: boolean): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(isFr ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }).format(date);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLanguage();
  const doc = await fetchLegalDocument(slug, locale);
  if (!doc) return { title: 'Document introuvable' };

  return {
    title: `${doc.title} | qoefi`,
    description: doc.summary,
    alternates: { canonical: `https://qoe.fi/legal/${doc.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: `${doc.title} — qoefi`,
      description: doc.summary,
      url: `https://qoe.fi/legal/${doc.slug}`,
      modifiedTime: doc.updatedAt,
    },
  };
}

export default async function LegalDocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLanguage();
  const isFr = !locale.startsWith('en');

  const [documents, doc] = await Promise.all([
    fetchLegalDocuments(locale),
    fetchLegalDocument(slug, locale),
  ]);

  if (!doc) notFound();

  const versions = await fetchLegalVersions(doc.slug, locale);
  // Le markdown maison échappe tout le HTML source : le rendu est sûr par
  // construction (aucun HTML brut accepté depuis la base).
  const html = markdownToHtml(doc.body ?? '');
  const headings = markdownHeadings(doc.body ?? '').filter((heading) => heading.level === 2);
  const history = versions.filter((version) => version.status !== 'DRAFT');
  const categoryLabel = CATEGORY_LABELS[doc.category]?.[isFr ? 'fr' : 'en'] ?? doc.category;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: doc.title,
    description: doc.summary,
    url: `https://qoe.fi/legal/${doc.slug}`,
    inLanguage: locale,
    version: doc.version,
    dateModified: doc.updatedAt,
    datePublished: doc.publishedAt,
    isPartOf: { '@type': 'WebSite', name: 'qoefi', url: 'https://qoe.fi' },
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <JsonLd data={jsonLd} />

      <Link
        href="/legal"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {isFr ? 'Toutes les informations légales' : 'All legal information'}
      </Link>

      <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
        <nav className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {isFr ? 'Informations légales' : 'Legal information'}
          </p>
          <ul className="space-y-1.5 border-l border-border pl-3">
            {documents.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/legal/${item.slug}`}
                  className={`block text-sm leading-snug transition-colors ${
                    item.slug === doc.slug
                      ? 'font-semibold text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0">
          <header className="border-b border-border pb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {categoryLabel}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{doc.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
                {isFr ? 'Version' : 'Version'} {doc.version}
              </span>
              {doc.effectiveAt && (
                <span>
                  {isFr ? 'En vigueur le' : 'Effective'} {formatDate(doc.effectiveAt, isFr)}
                </span>
              )}
              {doc.updatedAt && (
                <span>
                  {isFr ? 'Mise à jour le' : 'Updated'} {formatDate(doc.updatedAt, isFr)}
                </span>
              )}
            </div>
            {doc.summary && (
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{doc.summary}</p>
            )}
          </header>

          {headings.length >= 3 && (
            <nav className="mt-8 rounded-2xl border border-border bg-card p-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {isFr ? 'Sommaire' : 'Contents'}
              </p>
              <ol className="space-y-1.5 text-sm">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div
            className="mt-8 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <CookiePreferencesButton label={isFr ? 'Gérer mes cookies' : 'Manage my cookies'} />
            <Link href="/legal" className="text-sm text-muted-foreground underline">
              {isFr ? 'Tous les documents' : 'All documents'}
            </Link>
          </div>

          {history.length > 1 && (
            <section className="mt-10 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  {isFr ? 'Historique des versions' : 'Version history'}
                </h2>
              </div>
              <ul className="mt-4 space-y-3 text-sm">
                {history.map((version) => (
                  <li key={version.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">v{version.version}</span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {version.locale}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          version.status === 'PUBLISHED'
                            ? 'bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {version.status === 'PUBLISHED'
                          ? isFr
                            ? 'en vigueur'
                            : 'in force'
                          : isFr
                            ? 'archivée'
                            : 'archived'}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {version.effectiveAt
                        ? `${isFr ? 'En vigueur le' : 'Effective'} ${formatDate(version.effectiveAt, isFr)}`
                        : ''}
                      {version.effectiveAt && version.changelog ? ' · ' : ''}
                      {version.changelog ?? ''}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {isFr
                  ? 'Les versions archivées restent conservées comme preuve : une acceptation renvoie toujours à la version exacte qui a été acceptée.'
                  : 'Archived versions are retained as evidence: an acceptance always points to the exact version accepted.'}
              </p>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
