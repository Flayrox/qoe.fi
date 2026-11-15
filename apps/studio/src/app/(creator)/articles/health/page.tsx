import type { Metadata } from 'next';
import { getArticlesAction } from '@qoe/sdk/actions/articles';

import { ContentHealthClient } from './content-health-client';
import type { HealthArticleInput } from '@/features/content-health/lib/content-health';

export const metadata: Metadata = {
  title: 'Santé du contenu',
};

export default async function ContentHealthPage() {
  const result = await getArticlesAction('all');
  const articles: HealthArticleInput[] = result.ok
    ? result.data.map((article) => ({
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        published: article.published,
        status: article.status,
        imageUrl: article.imageUrl,
        coverAlt: article.coverAlt,
        coverDecorative: article.coverDecorative,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        categoryId: article.categoryId,
        category: article.category,
        updatedAt: article.updatedAt,
      }))
    : [];

  return (
    <ContentHealthClient
      articles={articles}
      loadError={result.ok ? null : 'La liste des articles n’a pas pu être chargée.'}
    />
  );
}
