'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import { Building2, UserRound } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Button } from '@qoe/ui/button';
import { Editor } from '@/features/editor/components/Editor';
import type { ArticleAttributionDraft } from '@/features/editor/components/ArticleAttributionEditor';
import { saveArticleAction } from '@qoe/sdk/actions/articles';
import type { EditorCapabilities } from '@qoe/sdk/actions/articles';

interface NewArticleClientProps {
  categories: { id: string; name: string; parentId?: string | null }[];
  capabilities?: EditorCapabilities;
  /** Publisher dans laquelle l'article sera créé (workspace actif). */
  target?: {
    type: 'PERSONAL' | 'MEDIA';
    name: string;
    fallbackFromMediaId?: string;
  };
}

export function NewArticleClient({ categories, capabilities, target }: NewArticleClientProps) {
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
    // Le hook d'auto-save sérialise déjà les requêtes : ne pas jeter une
    // sauvegarde manuelle au motif qu'une autre est en vol.
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
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/articles/${newId}`);
          }
        }
        return { id: newId };
      } else if (!res.ok) {
        throw new Error(res.error.message);
      } else {
        throw new Error(t`Échec de l'enregistrement.`);
      }
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : t`Échec de l'enregistrement.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full">
      {target && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t`Publier dans`}</span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              (
                document.querySelector(
                  'button[aria-label="Programmer"]'
                ) as HTMLButtonElement | null
              )?.click();
            }}
            className="gap-1.5 rounded-chip px-2.5 py-0.5 text-xs font-medium"
            title={t`Ouvrir les paramètres de publication`}
          >
            {target.type === 'MEDIA' ? (
              <Building2 className="size-3.5 text-primary" strokeWidth={1.5} />
            ) : (
              <UserRound className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            )}
            <span>{target.name}</span>
          </Button>
          {target.fallbackFromMediaId && (
            <span className={cn('text-highlight')}>
              {t`Ce média ne vous est plus accessible : l'article part dans votre profil personnel.`}
            </span>
          )}
        </div>
      )}
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
