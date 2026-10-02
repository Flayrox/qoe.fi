import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedSlug = decodeURIComponent(slug);
  const publication = await fetchTenantPublication(decodedDomain);
  const category = publication?.categories?.find((c) => c.slug === decodedSlug);
  const name = publication?.name || decodedDomain;
  return {
    title: `${category?.name || decodedSlug} | ${name}`,
    description: `Articles de la rubrique ${category?.name || decodedSlug} sur ${name}.`,
    alternates: {
      canonical: `https://${decodedDomain}/categorie/${encodeURIComponent(decodedSlug)}`,
    },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantCategoryPage({ params }: PageProps) {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedSlug = decodeURIComponent(slug);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const category = (publication.categories || []).find((c) => c.slug === decodedSlug);
  if (!category) notFound();

  const items = (publication.articles || []).filter(
    (a) =>
      a.published !== false && (a.category?.slug === decodedSlug || a.categoryId === category.id)
  );

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Rubrique
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{category.name}</h1>

      <div className="mt-8 divide-y divide-border">
        {items.map((art) => (
          <article key={art.id} className="py-5">
            <Link href={`/article/${art.slug}`} className="group">
              <h2 className="text-lg font-bold tracking-tight group-hover:text-[var(--tenant-accent)]">
                {art.title}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{art.readingTime} min de lecture</p>
            </Link>
          </article>
        ))}
        {items.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Aucun article dans cette rubrique.</p>
        )}
      </div>
    </TenantPageShell>
  );
}
