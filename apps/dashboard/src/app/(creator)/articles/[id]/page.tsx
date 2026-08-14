// =====================================================================
// 🖥️ Edit Article Page — apps/dashboard/src/app/(creator)/articles/[id]/page.tsx
// =====================================================================

import {
  getArticleByIdAction,
  getCategoriesAction,
  getEditorCapabilitiesAction,
} from '@qoe/api-client/actions/articles';

import { EditArticleClient } from './edit-article-client';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleEditPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const [articleRes, categoriesRes, capsRes] = await Promise.all([
      getArticleByIdAction(id),
      getCategoriesAction(),
      getEditorCapabilitiesAction(),
    ]);

    if (!articleRes.ok || !articleRes.data) {
      notFound();
    }

    const article = articleRes.data;
    const categoriesList = categoriesRes.ok ? categoriesRes.data : [];
    const capabilities = capsRes.ok ? capsRes.data : undefined;

    return (
      <EditArticleClient
        article={article}
        categories={categoriesList.map((c) => ({ id: c.id, name: c.name }))}
        capabilities={capabilities}
      />
    );
  } catch (error) {
    console.error('Error loading article:', error);
    notFound();
  }
}
