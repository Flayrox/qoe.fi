import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Recherche | ${name}`,
    description: `Rechercher dans les publications de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/search` },
    robots: { index: false, follow: true },
  };
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface GoHit {
  id: string;
  title: string;
  slug: string;
  content: string;
  categoryId: string | null;
  published: boolean;
  isPremium: boolean;
}

async function searchBackend(publicationId: string, query: string): Promise<GoHit[] | null> {
  // Backend Meilisearch scopé publication. Contenu premium retronqué côté Go
  // pour les appelants non propriétaires (zéro-fuite) — l'extrait affiché
  // est donc toujours sûr.
  try {
    const res = await goFetch<{ hits: GoHit[] }>(
      `/search/articles?q=${encodeURIComponent(query)}&publicationId=${encodeURIComponent(publicationId)}`
    );
    return (res.hits || []).filter((h) => h.published !== false && h.slug);
  } catch {
    return null;
  }
}

export default async function TenantSearchPage({ params, searchParams }: PageProps) {
  const { domain } = await params;
  const { q } = await searchParams;
  const decodedDomain = decodeURIComponent(domain);
  const query = (q || '').trim();

  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const categories = new Map((publication.categories || []).map((c) => [c.id, c.name]));

  let results: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    categoryName: string | null;
  }[] = [];
  if (query.length > 0) {
    const backend = await searchBackend(publication.id, query);
    if (backend) {
      results = backend.map((h) => ({
        id: h.id,
        title: h.title,
        slug: h.slug,
        excerpt: plainText(h.content || '').slice(0, 200),
        categoryName: (h.categoryId && categories.get(h.categoryId)) || null,
      }));
    } else {
      // Repli local si le backend est indisponible.
      results = (publication.articles || [])
        .filter((art) => {
          if (art.published === false) return false;
          const hay =
            `${art.title} ${plainText(art.content || '')} ${art.category?.name || ''}`.toLowerCase();
          return query
            .toLowerCase()
            .split(/\s+/)
            .every((w) => hay.includes(w));
        })
        .map((art) => ({
          id: art.id,
          title: art.title,
          slug: art.slug,
          excerpt: plainText(art.content || '').slice(0, 200),
          categoryName: art.category?.name || null,
        }));
    }
  }

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Recherche</h1>
      <form method="get" action="/search" className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Titre, sujet, rubrique…"
            className="w-full rounded-lg border border-input bg-background py-2.5 pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-[var(--tenant-accent)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Chercher
        </button>
      </form>

      {query.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          {results.length === 0
            ? `Aucun résultat pour « ${query} ».`
            : `${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${query} » :`}
        </p>
      )}

      <div className="mt-4 divide-y divide-border">
        {results.map((art) => (
          <article key={art.id} className="py-5">
            <Link href={`/article/${art.slug}`} className="group">
              {art.categoryName && (
                <p className="mb-1 text-xs font-medium text-muted-foreground">{art.categoryName}</p>
              )}
              <h2 className="text-lg font-bold tracking-tight group-hover:text-[var(--tenant-accent)]">
                {art.title}
              </h2>
              {art.excerpt && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{art.excerpt}</p>
              )}
            </Link>
          </article>
        ))}
      </div>
    </TenantPageShell>
  );
}
