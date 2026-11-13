import { notFound, permanentRedirect } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getArticleUrl, type ArticleResolvable } from '@qoe/config/routes';

interface ShortArticleResponse extends ArticleResolvable {
  id: string;
}

async function fetchArticleByShortCode(code: string): Promise<ShortArticleResponse | null> {
  try {
    return await goFetch<ShortArticleResponse>(`/v1/articles/short/${encodeURIComponent(code)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export default async function CoreShortArticlePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const decodedCode = decodeURIComponent(code);

  const article = await fetchArticleByShortCode(decodedCode);
  if (!article) {
    notFound();
  }

  permanentRedirect(getArticleUrl(article));
}
