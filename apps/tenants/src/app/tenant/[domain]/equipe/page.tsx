import { notFound } from 'next/navigation';
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
    title: `Équipe | ${name}`,
    description: `Les personnes derrière ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/equipe` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantTeamPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const members = new Map<
    string,
    { name: string; username: string | null; logoUrl: string | null }
  >();
  for (const art of publication.articles || []) {
    const author = (
      art as {
        author?: { name?: string | null; username?: string | null; logoUrl?: string | null } | null;
      }
    ).author;
    const key = author?.username || author?.name;
    if (key && !members.has(key)) {
      members.set(key, {
        name: author?.name || author?.username || key,
        username: author?.username || null,
        logoUrl: author?.logoUrl || null,
      });
    }
  }
  if (publication.user?.username && ![...members.keys()].includes(publication.user.username)) {
    members.set(publication.user.username, {
      name: publication.user.username,
      username: publication.user.username,
      logoUrl: publication.logoUrl,
    });
  }

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Équipe</h1>
      <p className="mt-3 text-muted-foreground">
        Les personnes derrière {publication.name || decodedDomain}.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[...members.values()].map((m) => {
          const inner = (
            <>
              {m.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.logoUrl} alt={m.name} className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-bold">
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{m.name}</p>
                {m.username && (
                  <p className="truncate text-xs text-muted-foreground">@{m.username}</p>
                )}
              </div>
            </>
          );
          return m.username ? (
            <Link
              key={m.username}
              href={`/auteur/${encodeURIComponent(m.username)}`}
              className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:border-foreground/30"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={m.name}
              className="flex items-center gap-3 rounded-lg border border-border p-4"
            >
              {inner}
            </div>
          );
        })}
        {members.size === 0 && (
          <p className="text-sm text-muted-foreground">Aucun membre pour le moment.</p>
        )}
      </div>
    </TenantPageShell>
  );
}
