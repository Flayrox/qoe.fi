'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Editor } from '@/features/editor/components/Editor';
import type { ArticleAttributionDraft } from '@/features/editor/components/ArticleAttributionEditor';
import { saveArticleAction } from '@qoe/api-client/actions/articles';
import type { EditorCapabilities } from '@qoe/api-client/actions/articles';

interface NewArticleClientProps {
  categories: { id: string; name: string }[];
  capabilities?: EditorCapabilities;
}

export function NewArticleClient({ categories, capabilities }: NewArticleClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const createdIdRef = React.useRef<string | null>(null);

  const handleSave = async (
    data: {
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
      id?: string;
    } & { id?: string }
  ): Promise<{ id?: string } | void> => {
    if (isSaving) return;
    // Si un id existe déjà (auto-save après création), on PATCH au lieu de POST
    const effectiveId = (data as { id?: string }).id || createdIdRef.current || undefined;
    const payload = effectiveId ? { ...data, id: effectiveId } : data;
    try {
      setIsSaving(true);
      const res = await saveArticleAction(payload as Parameters<typeof saveArticleAction>[0]);
      if (res.ok && res.data) {
        const newId = (res.data as { id: string }).id;
        if (!createdIdRef.current) {
          createdIdRef.current = newId;
          router.push(`/articles/${newId}`);
          router.refresh();
        }
        return { id: newId };
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
