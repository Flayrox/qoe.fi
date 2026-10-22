import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { PeopleSection } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Équipe & Contributeurs | ${name}`,
    description: `Découvrez les personnes qui créent et animent ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/equipe` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantTeamPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <div className="mx-auto w-full max-w-[680px] space-y-8 py-4">
        <div className="space-y-2">
          <Link
            href="/a-propos"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la présentation</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Équipe & Contributeurs
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Les voix, plumes et créateurs derrière {publication.name || decodedDomain}.
          </p>
        </div>

        <PeopleSection
          publication={publication}
          members={publication.team}
          title="Membres de la rédaction"
        />
      </div>
    </TenantPageShell>
  );
}
