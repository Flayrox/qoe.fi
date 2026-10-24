import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
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
    title: `Soutenir | ${name}`,
    description: `Soutenir ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/support` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantSupportPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  return (
    <TenantPageShell publication={publication} domain={decodedDomain} host={host}>
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-muted p-2.5">
          <Heart className="h-5 w-5" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Soutenir</h1>
      </div>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Votre soutien finance directement le travail de {publication.name || decodedDomain}.
      </p>

      <div className="mt-8">
        {publication.supportUrl ? (
          <a
            href={publication.supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Soutenir
          </a>
        ) : (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Aucun moyen de soutien n&apos;est configuré pour le moment.
          </p>
        )}
        {publication.stripeAccountId && (
          <p className="mt-4 text-xs text-muted-foreground">Paiements sécurisés par Stripe.</p>
        )}
      </div>
    </TenantPageShell>
  );
}
