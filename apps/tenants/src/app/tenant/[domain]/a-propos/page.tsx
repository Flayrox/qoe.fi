import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { AboutPageContent } from '@qoe/ui';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `À propos | ${name}`,
    description: publication?.bio || `À propos de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/a-propos` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantAboutPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <AboutPageContent
        publication={publication}
        members={publication.team}
        domain={decodedDomain}
      />
    </TenantPageShell>
  );
}
