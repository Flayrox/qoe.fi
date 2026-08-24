import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { ArticleAnnotatorView } from '@/components/social/ArticleAnnotatorView';
import { notFound } from 'next/navigation';

// Contrat de l'endpoint Go GET /v1/articles/{slug} (mode slug seul : premier
// article publié, contenu complet — parité findFirstBySlug Prisma).
interface GoArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  readingTime?: number;
  createdAt: string;
  isPremium?: boolean;
  accessGranted?: boolean;
  author: {
    id: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
  };
  publication?: {
    subdomain?: string | null;
    customDomain?: string | null;
  } | null;
}

async function fetchArticleBySlug(slug: string): Promise<GoArticle | null> {
  // Go (backend-of-record, requis en Phase 3) : GET /v1/articles/{slug}.
  // Retourne null sur 404 (goFetch lève avec err.status).
  try {
    return await goFetch<GoArticle>(`/v1/articles/${encodeURIComponent(slug)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const article = await fetchArticleBySlug(resolvedParams.slug);

  if (!article) {
    return {
      title: 'Article introuvable | qoe.fi',
    };
  }

  return {
    title: `${article.title} | qoe.fi`,
    description: article.content
      ? article.content.replace(/<[^>]*>?/gm, '').slice(0, 160)
      : undefined,
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const article = await fetchArticleBySlug(resolvedParams.slug);

  if (!article) {
    notFound();
  }

  return (
    <main className="w-full min-h-screen bg-background">
      <ArticleAnnotatorView article={article} />
    </main>
  );
}
