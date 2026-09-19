import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { History, Printer } from 'lucide-react';
import { markdownHeadings, markdownToHtml } from '@qoe/utils';
import { getLanguage } from '@qoe/i18n/server';
import { JsonLd } from '@qoe/ui';
import { fetchTenantPublication } from '@/lib/tenant-data';
import {
  fetchLegalDocument,
  fetchLegalDocuments,
  fetchLegalVersions,
  fetchPendingAcceptances,
} from '@qoe/sdk/actions/legal';
import { LegalBody, LegalShell, categoryLabel } from '@/components/legal/LegalShell';
import { PendingConsentBanner } from '@/components/legal/PendingConsentBanner';
import { CookiePreferencesButton } from '@qoe/ui';
import { sanitizeHtml } from '@/lib/sanitize';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

// The page already renders `doc.title` as its only h1. Remove a markdown body
// title only when it textually duplicates that title, so legal documents keep
// exactly one level-one heading without changing any other markdown semantics.
function stripDuplicateMarkdownTitle(markdown: string, title: string): string {
  const source = markdown ?? '';
  const [first, ...rest] = source.split('\n');
  const lead = /^\s*#\s+(.*?)\s*#*\s*$/.exec(first ?? '');
  const leadTitle = (lead?.[1] ?? '').trim().toLowerCase();
  if (leadTitle !== '' && leadTitle === (title ?? '').trim().toLowerCase()) {
    return rest.join('\n');
  }
  return source;
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const locale = await getLanguage();

  const [publication, doc] = await Promise.all([
    fetchTenantPublication(decodedDomain),
    fetchLegalDocument(slug, locale),
  ]);

  if (!doc) return { title: 'Document introuvable' };

  const name = publication?.name || decodedDomain;
  const description = doc.summary || `${doc.title} — ${name}`;

  return {
    title: `${doc.title} | ${name}`,
    description,
    alternates: { canonical: `https://${decodedDomain}/legal/${doc.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: `${doc.title} — ${name}`,
      description,
      url: `https://${decodedDomain}/legal/${doc.slug}`,
      modifiedTime: doc.updatedAt,
    },
  };
}

export default async function TenantLegalDocument({ params }: PageProps) {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const locale = await getLanguage();

  const [publication, documents, doc] = await Promise.all([
    fetchTenantPublication(decodedDomain),
    fetchLegalDocuments(locale),
    fetchLegalDocument(slug, locale),
  ]);

  if (!publication || !doc) notFound();

  const [versions, pending] = await Promise.all([
    fetchLegalVersions(doc.slug, locale),
    fetchPendingAcceptances(locale),
  ]);

  // Rendu : markdown maison (échappe tout le HTML source) puis DOMPurify
  // (défense en profondeur) — le corps est rédigé en base par des admins,
  // jamais rendu brut.
  const renderedBody = stripDuplicateMarkdownTitle(doc.body ?? '', doc.title);
  const html = sanitizeHtml(markdownToHtml(renderedBody));
  const headings = markdownHeadings(renderedBody).filter((heading) => heading.level === 2);
  const docPending = pending.filter((item) => item.slug === doc.slug);
  const archived = versions.filter((version) => version.status !== 'DRAFT');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: doc.title,
    description: doc.summary,
    url: `https://${decodedDomain}/legal/${doc.slug}`,
    inLanguage: locale,
    version: doc.version,
    dateModified: doc.updatedAt,
    datePublished: doc.publishedAt,
    isPartOf: { '@type': 'WebSite', name: publication.name, url: `https://${decodedDomain}` },
  };

  return (
    <LegalShell
      publication={publication}
      domain={decodedDomain}
      documents={documents}
      currentSlug={doc.slug}
    >
      <JsonLd data={jsonLd} />

      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--tenant-accent)]">
          {categoryLabel(doc.category)}
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{doc.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground">
            Version {doc.version}
          </span>
          {doc.effectiveAt && <span>En vigueur le {formatDate(doc.effectiveAt)}</span>}
          {doc.updatedAt && <span>Mise à jour le {formatDate(doc.updatedAt)}</span>}
          {doc.requiresAcceptance && (
            <span className="rounded-full bg-[var(--tenant-accent)]/10 px-2.5 py-1 font-semibold text-[var(--tenant-accent)]">
              Consentement requis
            </span>
          )}
        </div>
        {doc.summary && (
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{doc.summary}</p>
        )}
      </header>

      {docPending.length > 0 && (
        <PendingConsentBanner
          pending={docPending.map((item) => ({
            slug: item.slug,
            title: item.title,
            version: item.version,
          }))}
          locale={locale}
        />
      )}

      {headings.length >= 3 && (
        <nav className="mt-8 rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Sommaire
          </p>
          <ol className="space-y-1.5 text-sm">
            {headings.map((heading) => (
              <li key={heading.id} className="text-muted-foreground">
                <a
                  href={`#${heading.id}`}
                  className="transition-colors hover:text-[var(--tenant-accent)]"
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <LegalBody html={html} />

      <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-border pt-6 text-sm">
        <CookiePreferencesButton label="Gérer mes cookies" />
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Printer className="h-3.5 w-3.5" /> Astuce : Ctrl/Cmd + P pour archiver cette version en
          PDF
        </span>
      </div>

      {archived.length > 1 && (
        <section className="mt-12 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Historique des versions</h2>
          </div>
          <ul className="mt-4 space-y-3">
            {archived.map((version) => (
              <li key={version.id} className="text-sm">
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
                    {version.status === 'PUBLISHED' ? 'en vigueur' : 'archivée'}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {version.effectiveAt ? `En vigueur le ${formatDate(version.effectiveAt)}` : ''}
                  {version.effectiveAt && version.changelog ? ' · ' : ''}
                  {version.changelog ?? ''}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Les versions archivées restent conservées comme preuve : une acceptation renvoie
            toujours à la version exacte qui a été acceptée.{' '}
            <Link href="/legal" className="underline">
              Voir tous les documents
            </Link>
            .
          </p>
        </section>
      )}
    </LegalShell>
  );
}
