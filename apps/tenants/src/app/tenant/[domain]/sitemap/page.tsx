import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { buildCategoryPath } from '@qoe/utils';
import Link from 'next/link';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Plan du site | ${name}`,
    description: `Index des parutions et rubriques de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/sitemap` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantSitemapPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  // Regrouper les articles par année
  const articlesByYear = new Map<number, typeof publication.articles>();
  for (const art of publication.articles || []) {
    if (art.published === false) continue;
    const year = new Date(art.createdAt).getFullYear() || 2026;
    const list = articlesByYear.get(year) || [];
    list.push(art);
    articlesByYear.set(year, list);
  }

  const sortedYears = [...articlesByYear.keys()].sort((a, b) => b - a);

  return (
    <TenantPageShell publication={publication} domain={decodedDomain} host={host}>
      <div className="mx-auto w-full max-w-[624px] space-y-8 py-4">
        <div className="space-y-2 border-b border-border/40 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Plan du site — {publication.name || decodedDomain}
          </h1>
          <p className="text-sm text-muted-foreground">
            Index complet des archives, rubriques et pages de la publication.
          </p>
        </div>

        {/* Liens annuels d'archives chronologiques */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Articles par année
            </h2>
            <div className="space-y-2">
              {sortedYears.length > 0 ? (
                sortedYears.map((year) => (
                  <div
                    key={year}
                    className="flex items-center justify-between p-3 rounded-[6px] border border-border/40 hover:bg-muted/40 transition-colors"
                  >
                    <span className="font-medium text-sm text-foreground">
                      Parutions de l'année {year}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {articlesByYear.get(year)?.length || 0} article
                      {(articlesByYear.get(year)?.length || 0) > 1 ? 's' : ''}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucun article archivé.</p>
              )}
            </div>
          </div>

          {/* Rubriques */}
          {publication.categories && publication.categories.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/30">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Rubriques
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {publication.categories
                  .filter((cat) => !cat.isDefault)
                  .map((cat) => (
                    <Link
                      key={cat.id}
                      href={buildCategoryPath(cat, publication.categories)}
                      className="p-3 rounded-[6px] border border-border/40 hover:bg-muted/40 text-sm font-medium text-foreground transition-colors flex items-center justify-between"
                    >
                      <span>{cat.name}</span>
                      <span className="text-xs text-muted-foreground">Rubrique</span>
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {/* Pages clés */}
          <div className="space-y-3 pt-4 border-t border-border/30">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pages éditoriales
            </h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/about"
                className="px-3 py-1.5 rounded-[6px] border border-border/40 hover:bg-muted/40 transition-colors"
              >
                À propos
              </Link>
              <Link
                href="/team"
                className="px-3 py-1.5 rounded-[6px] border border-border/40 hover:bg-muted/40 transition-colors"
              >
                Équipe & Contributeurs
              </Link>
              <Link
                href="/thoughts"
                className="px-3 py-1.5 rounded-[6px] border border-border/40 hover:bg-muted/40 transition-colors"
              >
                Notes
              </Link>
            </div>
          </div>
        </div>
      </div>
    </TenantPageShell>
  );
}
