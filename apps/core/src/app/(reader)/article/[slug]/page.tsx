import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { findFirstBySlug } from '@qoe/db/repositories/articles';
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
  try {
    return await goFetch<GoArticle>(`/v1/articles/${encodeURIComponent(slug)}`);
  } catch {
    const article = await findFirstBySlug(slug);
    if (!article) return null;
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content ?? '',
      readingTime: article.readingTime ?? undefined,
      createdAt:
        article.createdAt instanceof Date
          ? article.createdAt.toISOString()
          : String(article.createdAt),
      isPremium: article.isPremium,
      accessGranted: true,
      author: {
        id: article.author.id,
        name: article.author.name ?? null,
        username: article.author.username ?? null,
        logoUrl: article.author.logoUrl ?? null,
      },
      publication: article.publication
        ? {
            subdomain: article.publication.subdomain ?? null,
            customDomain: article.publication.customDomain ?? null,
          }
        : null,
    };
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
