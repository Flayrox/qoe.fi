import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { SocialIcon } from '@qoe/ui';

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

  const articleCount = (publication.articles || []).filter((a) => a.published !== false).length;

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <div className="flex items-center gap-4">
        {publication.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publication.logoUrl}
            alt={publication.name || decodedDomain}
            className="h-16 w-16 rounded-md object-cover"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {publication.name || decodedDomain}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {articleCount} publication{articleCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {publication.bio && <p className="mt-6 leading-relaxed">{publication.bio}</p>}
      {publication.heroText && (
        <p className="mt-4 leading-relaxed text-muted-foreground">{publication.heroText}</p>
      )}

      {(publication.socialLinks || []).length > 0 && (
        <div className="mt-8 flex items-center gap-2">
          {publication.socialLinks.map((social) => (
            <a
              key={social.id}
              href={social.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SocialIcon platform={social.platform} className="h-4 w-4" />
            </a>
          ))}
        </div>
      )}
    </TenantPageShell>
  );
}
