import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantArticle, type TenantArticle } from '@/lib/tenant-data';
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
  const bySlugAPropos = await fetchTenantArticle(domain, 'a-propos');
  if (bySlugAPropos?.article) return bySlugAPropos.article;

  const bySlugAbout = await fetchTenantArticle(domain, 'about');
  if (bySlugAbout?.article) return bySlugAbout.article;

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;

  const aboutArticleId = (publication?.siteOptions?.aboutArticleId as string) || null;
  const aboutArticle = await resolveAboutArticle(decodedDomain, aboutArticleId);

  const title = aboutArticle?.title ? `${aboutArticle.title} | ${name}` : `À propos | ${name}`;
  const description = aboutArticle?.subtitle || publication?.bio || `À propos de ${name}.`;

  return {
    title,
    description,
    alternates: { canonical: `https://${decodedDomain}/a-propos` },
    robots: { index: publication?.allowIndexing !== false, follow: true },
  };
}

export default async function TenantAboutPage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const aboutArticleId = (publication.siteOptions?.aboutArticleId as string) || null;
  const aboutArticle = await resolveAboutArticle(decodedDomain, aboutArticleId);

  const articleHtml = aboutArticle?.content
    ? sanitizeHtml(markdownToHtml(aboutArticle.content))
    : null;

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <AboutPageContent
        publication={publication}
        members={publication.team}
        domain={decodedDomain}
        articleContent={articleHtml}
        articleTitle={aboutArticle?.title ?? null}
      />
    </TenantPageShell>
  );
}
