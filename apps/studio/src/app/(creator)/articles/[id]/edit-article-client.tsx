'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import { Editor } from '@/features/editor/components/Editor';
import type { ArticleAttributionDraft } from '@/features/editor/components/ArticleAttributionEditor';
import {
  saveArticleAction,
  discardArticleDraftAction,
  reviewArticleAction,
  type ArticleReviewFeedback,
} from '@qoe/sdk/actions/articles';
import { toast } from '@qoe/ui/toast';
import { buildAttributionDrafts } from '@/features/editor/lib/article-settings';
import type { EditorCapabilities } from '@qoe/sdk/actions/articles';

interface ArticleData {
  id: string;
  title: string;
  content: string;
  liveContent?: string | null;
  draftContent?: string | null;
  hasUnpublishedChanges?: boolean;
  reviewFeedback?: ArticleReviewFeedback | null;
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
  scheduledAt?: string | null;
  isPremium: boolean;
  allowDownload?: boolean;
  allowPublicAnnotations?: boolean;
  allowComments?: boolean;
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
  categories: { id: string; name: string; parentId?: string | null; slug?: string }[];
  capabilities?: EditorCapabilities;
}

export function EditArticleClient({ article, categories, capabilities }: EditArticleClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (
    data: {
      title: string;
      content: string;
      imageUrl: string | null;
      slug: string;
      published: boolean;
      status?: string;
      scheduledAt?: string | null;
      isPremium: boolean;
      categoryId: string | null;
      seoTitle: string | null;
      seoDescription: string | null;
      attributions?: ArticleAttributionDraft[];
    } & { id?: string }
  ): Promise<{ id?: string } | void> => {
    // Pas de court-circuit `if (isSaving) return` : le hook d'auto-save
    // sérialise déjà les requêtes, et jeter une sauvegarde manuelle pendant
    // un auto-save faisait perdre les dernières modifications.
    try {
      setIsSaving(true);
      const res = await saveArticleAction({
        id: (data as { id?: string }).id || article.id,
        ...data,
      });
      if (!res.ok) {
        throw new Error(res.error.message);
      }
      // saveArticleAction renvoie l'article mis à jour ; on garde l'id pour l'auto-save
      return { id: res.data?.id || article.id };
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : t`Échec de l'enregistrement.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscardDraft = async () => {
    const res = await discardArticleDraftAction({ id: article.id });
    if (!res.ok) {
      throw new Error(res.error?.message || t`Impossible d'abandonner le brouillon.`);
    }
    router.refresh();
  };

  const handleReview = async (approve: boolean, comment?: string) => {
    const res = await reviewArticleAction({ id: article.id, approve, comment });
    if (!res.ok) {
      throw new Error(res.error?.message || t`Échec de la revue.`);
    }
    toast.success(
      approve ? t`Article approuvé et publié.` : t`Demande de retouches transmise à l'auteur.`
    );
    router.refresh();
  };

  const initialAttributions = React.useMemo(() => buildAttributionDrafts(article), [article]);

  return (
    <div className="py-4">
      <Editor
        initialTitle={article.title}
        initialSlug={article.slug}
        initialContent={article.content}
        initialLiveContent={article.liveContent}
        initialHasUnpublishedChanges={article.hasUnpublishedChanges}
        initialReviewFeedback={article.reviewFeedback}
        initialImageUrl={article.imageUrl}
        initialPublished={article.published}
        initialStatus={article.status}
        initialScheduledAt={article.scheduledAt ?? null}
        initialIsPremium={article.isPremium}
        initialAllowDownload={article.allowDownload ?? true}
        initialAllowPublicAnnotations={article.allowPublicAnnotations ?? true}
        initialAllowComments={article.allowComments ?? true}
        initialCategoryId={article.categoryId}
        initialSeoTitle={article.seoTitle || ''}
        initialSeoDescription={article.seoDescription || ''}
        initialAttributions={initialAttributions}
        collaborationRoomId={article.id}
        categories={categories}
        isSaving={isSaving}
        capabilities={capabilities}
        onSave={handleSave}
        onDiscardDraft={handleDiscardDraft}
        onReview={capabilities?.canReview ? handleReview : undefined}
        onBack={() => router.push('/articles')}
      />
    </div>
  );
}
