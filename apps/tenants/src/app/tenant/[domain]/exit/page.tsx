import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { ExitCard } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ url?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;

  return {
    title: `Redirection externe | ${name}`,
    description: `Avertissement de redirection vers un site externe depuis ${name}.`,
    robots: { index: false, follow: false },
  };
}

export default async function TenantExitPage({ params, searchParams }: PageProps) {
  const { domain } = await params;
  const { url: rawTargetUrl } = await searchParams;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;
  const publicationName = publication.name || decodedDomain;

  return (
    <TenantPageShell
      publication={publication}
      domain={decodedDomain}
      host={host}
      backLabel="Annuler et retourner"
      currentPath="/exit"
    >
      <ExitCard targetUrl={rawTargetUrl} publicationName={publicationName} onBackUrl="/" />
    </TenantPageShell>
  );
}
