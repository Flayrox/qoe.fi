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
  // Next décode déjà le segment de route : un second `decodeURIComponent`
  // levait `URIError: URI malformed` (500) dès qu'un code contenait un `%`.
  const { code } = await params;

  const article = await fetchArticleByShortCode(code);
  if (!article) {
    notFound();
  }

  permanentRedirect(getArticleUrl(article));
}
