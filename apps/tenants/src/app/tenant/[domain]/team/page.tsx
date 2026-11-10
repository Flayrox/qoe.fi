import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { fetchTenantPublisher } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { PeopleSection } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  const name = publisher?.name || decodedDomain;
  return {
    title: `Équipe & Contributeurs | ${name}`,
    description: `Découvrez les personnes qui créent et animent ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/team` },
    robots: { index: publisher?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantTeamPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  if (!publisher) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  return (
    <TenantPageShell publisher={publisher} domain={decodedDomain} host={host}>
      <div className="mx-auto w-full max-w-[680px] space-y-8 py-4">
        <div className="space-y-2">
          <Link
            href="/about"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la présentation</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Équipe & Contributeurs
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Les voix, plumes et créateurs derrière {publisher.name || decodedDomain}.
          </p>
        </div>

        <PeopleSection
          publisher={publisher}
          members={publisher.team}
          title="Membres de la rédaction"
        />
      </div>
    </TenantPageShell>
  );
}
