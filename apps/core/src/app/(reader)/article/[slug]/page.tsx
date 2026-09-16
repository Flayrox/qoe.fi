import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { permanentRedirect, notFound } from 'next/navigation';

interface GoArticle {
  id: string;
  slug: string;
  author: {
    username?: string | null;
  };
  publication?: {
    slug?: string | null;
    subdomain?: string | null;
  } | null;
}

export default async function ArticleLegacyRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const resolvedParams = await params;
  let article: GoArticle | null = null;
  try {
    article = await goFetch<GoArticle>(`/v1/articles/${encodeURIComponent(resolvedParams.slug)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) notFound();
    throw err;
  }

  if (!article) notFound();

  const canonicalOwner =
    article.publication?.slug ||
    article.publication?.subdomain ||
    article.author?.username ||
    'article';

  const sp = await searchParams;
  const searchStr =
    sp && Object.keys(sp).length > 0 ? `?${new URLSearchParams(sp).toString()}` : '';
  permanentRedirect(
    `/${encodeURIComponent(canonicalOwner)}/${encodeURIComponent(article.slug)}${searchStr}`
  );
}
