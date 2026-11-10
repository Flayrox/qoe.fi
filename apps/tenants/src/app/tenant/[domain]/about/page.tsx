import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { fetchTenantPublisher, fetchTenantArticle, type TenantArticle } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { AboutPageContent } from '@qoe/ui';
import { markdownToHtml } from '@qoe/utils';
import { sanitizeHtml } from '@/lib/sanitize';

interface PageProps {
  params: Promise<{ domain: string }>;
}

async function resolveAboutArticle(
  domain: string,
  aboutArticleId?: string | null
): Promise<TenantArticle | null> {
  if (aboutArticleId) {
    const bundle = await fetchTenantArticle(domain, aboutArticleId);
    if (bundle?.article) return bundle.article;
  }
  const bySlugAbout = await fetchTenantArticle(domain, 'about');
  if (bySlugAbout?.article) return bySlugAbout.article;

  // Compatibilité avec les publications créées avant le slug anglais.
  const bySlugAPropos = await fetchTenantArticle(domain, 'a-propos');
  if (bySlugAPropos?.article) return bySlugAPropos.article;

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  const name = publisher?.name || decodedDomain;

  const aboutArticleId = (publisher?.siteOptions?.aboutArticleId as string) || null;
  const aboutArticle = await resolveAboutArticle(decodedDomain, aboutArticleId);

  const title = aboutArticle?.title ? `${aboutArticle.title} | ${name}` : `À propos | ${name}`;
  const description = aboutArticle?.subtitle || publisher?.bio || `À propos de ${name}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://${decodedDomain}/about` },
    robots: { index: publisher?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantAboutPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  if (!publisher) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  const aboutArticleId = (publisher.siteOptions?.aboutArticleId as string) || null;
  const aboutArticle = await resolveAboutArticle(decodedDomain, aboutArticleId);

  const articleHtml = aboutArticle?.content
    ? sanitizeHtml(markdownToHtml(aboutArticle.content))
    : null;

  return (
    <TenantPageShell publisher={publisher} domain={decodedDomain} host={host} currentPath="/about">
      <AboutPageContent
        publisher={publisher}
        members={publisher.team}
        domain={decodedDomain}
        articleContent={articleHtml}
        articleTitle={aboutArticle?.title ?? null}
      />
    </TenantPageShell>
  );
}
