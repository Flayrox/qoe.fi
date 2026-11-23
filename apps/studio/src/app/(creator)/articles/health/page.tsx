import type { Metadata } from 'next';
import { getLanguage } from '@qoe/i18n/server';
import { getArticlesHealthAction } from '@qoe/sdk/actions/articles';

import { ContentHealthClient } from './content-health-client';
import type { HealthArticleInput } from '@/features/content-health/lib/content-health';
import { t } from '@lingui/core/macro';

// Métadonnées rendues hors du provider i18n : la langue de la requête est lue
// sans activer le singleton (cf. packages/i18n/src/server.ts).
export async function generateMetadata(): Promise<Metadata> {
  const isFr = (await getLanguage()) === 'fr';
  return {
    title: isFr ? t`Santé du contenu` : 'Content health',
  };
}

export default async function ContentHealthPage() {
  const result = await getArticlesHealthAction();
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
      loadError={result.ok ? null : t`La liste des articles n’a pas pu être chargée.`}
    />
  );
}
