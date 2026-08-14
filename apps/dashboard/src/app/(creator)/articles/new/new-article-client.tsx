'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Editor } from '@/features/editor/components/Editor';
import { saveArticleAction } from '@qoe/api-client/actions/articles';
import type { EditorCapabilities } from '@qoe/api-client/actions/articles';

interface NewArticleClientProps {
  categories: { id: string; name: string }[];
  capabilities?: EditorCapabilities;
}

export function NewArticleClient({ categories, capabilities }: NewArticleClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (data: {
    title: string;
    content: string;
    slug: string;
    published: boolean;
    status?: string;
    isPremium: boolean;
    categoryId: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }) => {
    try {
      const res = await saveArticleAction(data);
      if (res.ok && res.data) {
        router.push(`/articles/${res.data.id}`);
        router.refresh();
      } else if (!res.ok) {
        throw new Error(res.error.message);
      } else {
        throw new Error("Échec de l'enregistrement.");
      }
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="py-4">
      <Editor
        categories={categories}
        isSaving={isSaving}
        capabilities={capabilities}
        onSave={handleSave}
        onBack={() => router.push('/articles')}
      />
    </div>
  );
}
