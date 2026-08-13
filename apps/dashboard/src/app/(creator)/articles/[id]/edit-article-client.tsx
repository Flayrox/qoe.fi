'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Editor } from '@/features/editor/components/Editor';
import { saveArticleAction } from '@qoe/api-client/actions/articles';

interface ArticleData {
  id: string;
  title: string;
  content: string;
  slug: string;
  published: boolean;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface EditArticleClientProps {
  article: ArticleData;
  categories: { id: string; name: string }[];
}

export function EditArticleClient({ article, categories }: EditArticleClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (data: {
    title: string;
    content: string;
    slug: string;
    published: boolean;
    isPremium: boolean;
    categoryId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }) => {
    try {
      setIsSaving(true);
      await saveArticleAction({
        id: article.id,
        ...data,
      });
      router.refresh();
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="py-4">
      <Editor
        initialTitle={article.title}
        initialSlug={article.slug}
        initialContent={article.content}
        initialPublished={article.published}
        initialIsPremium={article.isPremium}
        initialCategoryId={article.categoryId}
        initialSeoTitle={article.seoTitle || ''}
        initialSeoDescription={article.seoDescription || ''}
        categories={categories}
        isSaving={isSaving}
        onSave={handleSave}
        onBack={() => router.push('/articles')}
      />
    </div>
  );
}
