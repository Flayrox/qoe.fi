import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';

interface PageProps {
  params: Promise<{ domain: string; username: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, username } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedUsername = decodeURIComponent(username);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `@${decodedUsername} | ${name}`,
    description: `Articles de @${decodedUsername} sur ${name}.`,
    alternates: {
      canonical: `https://${decodedDomain}/author/${encodeURIComponent(decodedUsername)}`,
    },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantAuthorPage({ params }: PageProps) {
  const { domain, username } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedUsername = decodeURIComponent(username).replace(/^@/, '');
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const items = (publication.articles || []).filter((a) => {
    const author = (a as { author?: { name?: string | null; username?: string | null } | null })
      .author;
    if (author?.username === decodedUsername || author?.name === decodedUsername)
      return a.published !== false;
    if (!author && publication.user?.username === decodedUsername) return a.published !== false;
    return false;
  });

  if (items.length === 0) notFound();

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Auteur
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">@{decodedUsername}</h1>

      <div className="mt-8 divide-y divide-border">
        {items.map((art) => (
          <article key={art.id} className="py-5">
            <Link href={`/article/${art.slug}`} className="group">
              <h2 className="text-lg font-bold tracking-tight group-hover:text-[var(--tenant-accent)]">
                {art.title}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {art.category?.name ? `${art.category.name} · ` : ''}
                {art.readingTime} min de lecture
              </p>
            </Link>
          </article>
        ))}
      </div>
    </TenantPageShell>
  );
}
