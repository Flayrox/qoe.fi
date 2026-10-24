import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantThoughts } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { ThoughtCard, type ThoughtData } from '@qoe/ui';
import { MessageSquareText } from 'lucide-react';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Pensées | ${name}`,
    description: `Le flux des pensées et réflexions de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/thoughts` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantThoughtsPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  const authorName = publication.name || 'L’Auteur';
  const authorUsername =
    publication.user?.username || publication.slug || publication.subdomain || decodedDomain;

  // Récupération des VRAIES pensées de la publication / auteur
  const { items } = await fetchTenantThoughts(authorUsername, 30, 0);

  const thoughts: ThoughtData[] = items.map((item) => ({
    id: item.id,
    content: item.content,
    createdAt: item.createdAt,
    imageUrl: item.imageUrl,
    likeCount: item.likeCount,
    repostCount: item.repostCount,
    replyCount: item.replyCount,
    isPinned: item.isPinned,
    author: {
      id: item.author.id,
      name: item.author.name,
      username: item.author.username,
      logoUrl: item.author.logoUrl,
      isCertified: item.author.isCertified,
    },
    attachments: item.attachments,
    poll: item.poll as ThoughtData['poll'],
    articleQuote: item.articleQuote,
  }));

  return (
    <TenantPageShell
      publication={publication}
      domain={decodedDomain}
      host={host}
      currentPath="/thoughts"
    >
      <div className="mx-auto w-full max-w-[600px] space-y-6 py-4">
        {/* En-tête du flux de pensées */}
        <div className="border-b border-border/40 pb-4 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Pensées
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              {thoughts.length} {thoughts.length > 1 ? 'pensées' : 'pensée'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Les réflexions, citations et partages en direct de {authorName}.
          </p>
        </div>

        {/* Flux réel */}
        {thoughts.length > 0 ? (
          <div className="space-y-4">
            {thoughts.map((thought) => (
              <ThoughtCard key={thought.id} post={thought} variant="timeline" />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center space-y-3 bg-card/40 rounded-2xl border border-border/40 p-6">
            <div className="w-10 h-10 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
              <MessageSquareText className="w-5 h-5 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Aucune pensée pour le moment</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {authorName} n'a pas encore partagé de pensée publique. Revenez bientôt ou
              abonnez-vous pour être prévenu.
            </p>
          </div>
        )}
      </div>
    </TenantPageShell>
  );
}
