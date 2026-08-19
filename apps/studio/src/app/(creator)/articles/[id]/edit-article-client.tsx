'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Editor } from '@/features/editor/components/Editor';
import type { ArticleAttributionDraft } from '@/features/editor/components/ArticleAttributionEditor';
import { saveArticleAction } from '@qoe/api-client/actions/articles';
import type { EditorCapabilities } from '@qoe/api-client/actions/articles';

interface ArticleData {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  };
  imageUrl: string | null;
  slug: string;
  published: boolean;
  status?: string;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  coAuthors: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified: boolean;
  }>;
  attributions: Array<{
    user: {
      id: string;
      name: string | null;
      username: string | null;
      logoUrl: string | null;
      isCertified: boolean;
    };
    role: string;
    order: number;
    isVisible: boolean;
    consentStatus?: string;
  }>;
}

interface EditArticleClientProps {
  article: ArticleData;
  categories: { id: string; name: string }[];
  capabilities?: EditorCapabilities;
}

export function EditArticleClient({ article, categories, capabilities }: EditArticleClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (data: {
    title: string;
    content: string;
    imageUrl: string | null;
    slug: string;
    published: boolean;
    status?: string;
    isPremium: boolean;
    categoryId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    attributions?: ArticleAttributionDraft[];
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
        initialImageUrl={article.imageUrl}
        initialPublished={article.published}
        initialStatus={article.status}
        initialIsPremium={article.isPremium}
        initialCategoryId={article.categoryId}
        initialSeoTitle={article.seoTitle || ''}
        initialSeoDescription={article.seoDescription || ''}
        initialAttributions={[
          ...(article.attributions.length > 0
            ? article.attributions.map((entry) => ({
                userId: entry.user.id,
                name: entry.user.name,
                username: entry.user.username,
                logoUrl: entry.user.logoUrl,
                isCertified: entry.user.isCertified,
                role: entry.role,
                order: entry.order,
                isVisible: entry.isVisible,
                consentStatus: entry.consentStatus,
              }))
            : [
                {
                  userId: article.author.id,
                  name: article.author.name,
                  username: article.author.username,
                  logoUrl: article.author.logoUrl,
                  isCertified: article.author.isCertified,
                  role: 'PRIMARY_AUTHOR',
                  order: 0,
                  isVisible: true,
                },
              ]),
          ...article.coAuthors
            .filter(
              (coAuthor) =>
                !article.attributions.some((attribution) => attribution.user.id === coAuthor.id)
            )
            .map((coAuthor, index) => ({
              userId: coAuthor.id,
              name: coAuthor.name,
              username: coAuthor.username,
              logoUrl: coAuthor.logoUrl,
              isCertified: coAuthor.isCertified,
              role: 'CO_AUTHOR',
              order: article.attributions.length + index,
              isVisible: true,
              consentStatus: 'ACCEPTED',
            })),
        ]}
        collaborationRoomId={article.id}
        categories={categories}
        isSaving={isSaving}
        capabilities={capabilities}
        onSave={handleSave}
        onBack={() => router.push('/articles')}
      />
    </div>
  );
}
