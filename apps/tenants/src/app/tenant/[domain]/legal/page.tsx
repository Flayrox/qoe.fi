import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { getLanguage } from '@qoe/i18n/server';
import { fetchTenantPublication } from '@/lib/tenant-data';
import {
  fetchLegalDocuments,
  fetchPendingAcceptances,
  type PendingAcceptance,
} from '@qoe/sdk/actions/legal';
import { LegalShell, categoryLabel } from '@/components/legal/LegalShell';
import { PendingConsentBanner } from '@/components/legal/PendingConsentBanner';
import { CookiePreferencesButton } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;

  return {
    title: `Informations légales | ${name}`,
    description: `Conditions générales, confidentialité, cookies et informations légales de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/legal` },
    robots: { index: true, follow: true },
  };
}

export default async function TenantLegalIndex({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const locale = await getLanguage();

  const [publication, documents] = await Promise.all([
    fetchTenantPublication(decodedDomain),
    fetchLegalDocuments(locale),
  ]);

  if (!publication) notFound();

  // Vide pour un visiteur anonyme (401 côté API) : jamais bloquant.
  const pending: PendingAcceptance[] = await fetchPendingAcceptances(locale);

  const grouped = new Map<string, typeof documents>();
  for (const doc of documents) {
    const list = grouped.get(doc.category) ?? [];
    list.push(doc);
    grouped.set(doc.category, list);
  }

  return (
    <LegalShell publication={publication} domain={decodedDomain} documents={documents}>
      <header>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Informations légales</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Toutes les règles du jeu, en clair : ce que {publication.name || decodedDomain}{' '}
          s&apos;engage à faire, ce que vous acceptez, comment vos données sont traitées et comment
          exercer vos droits. Chaque document est versionné et l&apos;historique reste consultable.
        </p>
      </header>

      {pending.length > 0 && (
        <PendingConsentBanner
          pending={pending.map((item) => ({
            slug: item.slug,
            title: item.title,
            version: item.version,
          }))}
          locale={locale}
        />
      )}

      <div className="mt-12 space-y-12">
        {[...grouped.entries()].map(([category, docs]) => (
          <section key={category}>
            <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {categoryLabel(category)}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/legal/${doc.slug}`}
                  className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--tenant-accent)]/40 hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-[var(--tenant-accent)]/10 p-2 text-[var(--tenant-accent)]">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold leading-snug group-hover:text-[var(--tenant-accent)]">
                        {doc.title}
                      </h3>
                      {doc.summary && (
                        <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">
                          {doc.summary}
                        </p>
                      )}
                      <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Version {doc.version}
                        {doc.effectiveAt
                          ? ` · en vigueur le ${new Date(doc.effectiveAt).toLocaleDateString('fr-FR')}`
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
            Les documents légaux sont en cours de publication.
          </p>
        )}
      </div>

      <section className="mt-16 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Vos préférences de cookies</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous pouvez à tout moment revenir sur votre choix concernant les cookies de mesure
          d&apos;audience et de personnalisation.
        </p>
        <div className="mt-4">
          <CookiePreferencesButton />
        </div>
      </section>
    </LegalShell>
  );
}
