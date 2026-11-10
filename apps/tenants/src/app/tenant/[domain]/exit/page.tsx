import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { fetchTenantPublisher } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { ExitCard } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ url?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  const name = publisher?.name || decodedDomain;

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
  const publisher = await fetchTenantPublisher(decodedDomain);
  if (!publisher) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;
  const publisherName = publisher.name || decodedDomain;

  return (
    <TenantPageShell
      publisher={publisher}
      domain={decodedDomain}
      host={host}
      backLabel="Annuler et retourner"
      currentPath="/exit"
    >
      <ExitCard targetUrl={rawTargetUrl} publisherName={publisherName} onBackUrl="/" />
    </TenantPageShell>
  );
}
