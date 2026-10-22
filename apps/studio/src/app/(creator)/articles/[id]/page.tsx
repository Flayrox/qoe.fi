// =====================================================================
// 🖥️ Edit Article Page — apps/studio/src/app/(creator)/articles/[id]/page.tsx
// =====================================================================

import {
  getArticleByIdAction,
  getCategoriesAction,
  getEditorCapabilitiesAction,
} from '@qoe/sdk/actions/articles';

import { EditArticleClient } from './edit-article-client';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleEditPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const articleRes = await getArticleByIdAction(id);
    if (!articleRes.ok || !articleRes.data) {
      notFound();
    }
    const article = articleRes.data;

    // Co-auteurs : catégories et capacités doivent être celles de la
    // publication de l'article, pas celles du workspace actif.
    const [categoriesRes, capsRes] = await Promise.all([
      getCategoriesAction(article.publicationId),
      getEditorCapabilitiesAction({
        publicationId: article.publicationId,
        articleId: article.id,
      }),
    ]);
    const categoriesList = categoriesRes.ok ? categoriesRes.data : [];
    const capabilities = capsRes.ok ? capsRes.data : undefined;

    return (
      <EditArticleClient
        article={article}
        categories={categoriesList.map((c) => ({
          id: c.id,
          name: c.name?.trim() || c.slug,
          slug: c.slug,
          parentId: c.parentId,
        }))}
        capabilities={capabilities}
      />
    );
  } catch (error) {
    console.error('Error loading article:', error);
    notFound();
  }
}
