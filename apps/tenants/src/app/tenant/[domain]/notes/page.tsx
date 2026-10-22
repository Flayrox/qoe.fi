import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { ThoughtCard, type ThoughtData } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Notes & Pensées | ${name}`,
    description: `Le flux des réflexions courtes et notes de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/notes` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantNotesPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  // Pour l'instant, simuler ou récupérer les thoughts de l'auteur principal
  const authorName = publication.name || 'L’Auteur';
  const authorUsername = publication.user?.username || null;
  const authorLogo = publication.logoUrl || null;

  // Thoughts d'introduction ou publiés de la publication
  const thoughts: ThoughtData[] = [
    {
      id: `welcome-thought-${publication.id}`,
      content:
        publication.heroText ||
        `Bienvenue sur le flux Notes de ${authorName}. Retrouvez ici nos réflexions spontanées, coulisses éditoriales et découvertes du moment.`,
      createdAt: new Date().toISOString(),
      isPinned: true,
      author: {
        id: publication.user?.id || publication.id,
        name: authorName,
        username: authorUsername,
        logoUrl: authorLogo,
        isCertified: publication.isCertified,
      },
      likesCount: 12,
      repliesCount: 3,
      repostsCount: 5,
    },
  ];

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <div className="mx-auto w-full max-w-[600px] space-y-6 py-4">
        {/* En-tête du flux de notes */}
        <div className="border-b border-border/40 pb-4 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Notes</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              Pensées courtes
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Les réflexions, citations et partages de {authorName}.
          </p>
        </div>

        {/* Flux de notes format compact Substack */}
        <div className="space-y-4">
          {thoughts.map((thought) => (
            <ThoughtCard key={thought.id} post={thought} variant="timeline" />
          ))}
        </div>
      </div>
    </TenantPageShell>
  );
}
