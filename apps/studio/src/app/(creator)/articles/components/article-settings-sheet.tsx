'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import {
  getArticleByIdAction,
  saveArticleAction,
  unpublishArticleAction,
  type ArticleEditorPayload,
} from '@qoe/sdk/actions/articles';
import { EditorSettingsDrawer } from '@/features/editor/components/EditorSettingsDrawer';
import type { ArticleAttributionDraft } from '@/features/editor/components/ArticleAttributionEditor';
import {
  currentTimeZoneLabel,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/features/editor/lib/datetime';

import type { CategoryWithCount } from './article-list-types';
import type { ConfirmAction } from './confirm-action-dialog';

interface ArticleSettingsDraft {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  slug: string;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  scheduleDraft: string;
  isPremium: boolean;
  categoryId: string | null;
  seoTitle: string;
  seoDescription: string;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  allowDownload: boolean;
  attributions: ArticleAttributionDraft[];
  subdomain?: string;
}

function buildAttributionDrafts(article: ArticleEditorPayload): ArticleAttributionDraft[] {
  const existing = (article.attributions ?? []).map((entry) => ({
    userId: entry.user.id,
    name: entry.user.name,
    username: entry.user.username,
    logoUrl: entry.user.logoUrl,
    isCertified: entry.user.isCertified,
    role: entry.role,
    order: entry.order,
    isVisible: entry.isVisible,
    consentStatus: entry.consentStatus,
  }));
  if (existing.length > 0) return existing;

  const base: ArticleAttributionDraft = {
    userId: article.author.id,
    name: article.author.name,
    username: article.author.username,
    logoUrl: article.author.logoUrl,
    isCertified: article.author.isCertified,
    role: 'PRIMARY_AUTHOR',
    order: 0,
    isVisible: true,
  };
  const coAuthors = (article.coAuthors ?? [])
    .filter((coAuthor) => coAuthor.id !== article.author.id)
    .map((coAuthor, index) => ({
      userId: coAuthor.id,
      name: coAuthor.name,
      username: coAuthor.username,
      logoUrl: coAuthor.logoUrl,
      isCertified: coAuthor.isCertified,
      role: 'CO_AUTHOR',
      order: 1 + index,
      isVisible: true,
      consentStatus: 'ACCEPTED',
    }));
  return [base, ...coAuthors];
}

export function ArticleSettingsSheet({
  articleId,
  categories,
  canPublish,
  onClose,
  onSaved,
  onRequestConfirm,
}: {
  articleId: string;
  categories: CategoryWithCount[];
  canPublish: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onRequestConfirm: (action: ConfirmAction) => void;
}) {
  const [draft, setDraft] = useState<ArticleSettingsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft(null);

    getArticleByIdAction(articleId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.data) {
          toast.error(t`Impossible de charger les paramètres de l'article.`);
          onClose();
          return;
        }
        const article = res.data;
        setDraft({
          id: article.id,
          title: article.title,
          content: article.content,
          imageUrl: article.imageUrl ?? null,
          slug: article.slug,
          published: article.published,
          status: article.status,
          scheduledAt: article.scheduledAt ?? null,
          scheduleDraft: toDateTimeLocalValue(article.scheduledAt),
          isPremium: article.isPremium,
          categoryId: article.categoryId,
          seoTitle: article.seoTitle ?? '',
          seoDescription: article.seoDescription ?? '',
          allowPublicAnnotations: article.allowPublicAnnotations ?? true,
          allowComments: article.allowComments ?? true,
          allowDownload: article.allowDownload ?? true,
          attributions: buildAttributionDrafts(article),
          subdomain: article.publication?.subdomain ?? undefined,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load article settings', err);
        toast.error(t`Impossible de charger les paramètres de l'article.`);
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId, onClose]);

  const patchSettings = (patch: Partial<ArticleSettingsDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const scheduledAt = draft.scheduleDraft
        ? (parseDateTimeLocalValue(draft.scheduleDraft)?.toISOString() ?? null)
        : null;
      const status = scheduledAt
        ? 'SCHEDULED'
        : draft.status === 'SCHEDULED'
          ? 'DRAFT'
          : draft.status;
      const res = await saveArticleAction({
        id: draft.id,
        title: draft.title,
        content: draft.content,
        imageUrl: draft.imageUrl,
        slug: draft.slug,
        published: draft.published,
        status,
        scheduledAt,
        isPremium: draft.isPremium,
        categoryId: draft.categoryId,
        seoTitle: draft.seoTitle.trim() || null,
        seoDescription: draft.seoDescription.trim() || null,
        allowPublicAnnotations: draft.allowPublicAnnotations,
        allowComments: draft.allowComments,
        allowDownload: draft.allowDownload,
        attributions: draft.attributions,
      });
      if (!res.ok) throw new Error(res.error.message);
      toast.success(t`Paramètres de l'article enregistrés.`);
      onClose();
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Échec de l'enregistrement.`);
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = () => {
    if (!draft) return;
    const date = parseDateTimeLocalValue(draft.scheduleDraft);
    if (!date || date.getTime() <= Date.now()) {
      toast.error(t`Choisissez une date future pour programmer l'article.`);
      return;
    }
    patchSettings({ scheduledAt: date.toISOString(), status: 'SCHEDULED' });
  };

  const handleClearSchedule = () => {
    patchSettings({
      scheduledAt: null,
      scheduleDraft: '',
      status: draft?.published ? 'PUBLISHED' : 'DRAFT',
    });
  };

  const handleUnpublish = () => {
    if (!draft) return;
    const id = draft.id;
    onRequestConfirm({
      title: t`Dépublier cet article ?`,
      description: t`Il sera immédiatement retiré du site public et repassera en brouillon. Le contenu est conservé.`,
      confirmLabel: t`Dépublier`,
      destructive: true,
      onConfirm: async () => {
        const res = await unpublishArticleAction(id);
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        toast.success(t`Article dépublié.`);
        onClose();
        await onSaved();
      },
    });
  };

  if (loading || !draft) {
    return (
      <div className="fixed inset-0 z-50 overflow-hidden font-sans">
        <div
          className="fixed inset-0 bg-background/50 backdrop-blur-xs transition-opacity duration-200"
          onClick={onClose}
        />
        <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
          <aside className="flex w-screen max-w-md flex-col items-center justify-center border-l border-border/50 bg-card shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="mt-3 text-xs text-muted-foreground">{t`Chargement des paramètres…`}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label={t`Fermer`}
              className="absolute right-5 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <EditorSettingsDrawer
      open
      onClose={onClose}
      published={draft.published}
      status={draft.status}
      scheduledAt={draft.scheduledAt}
      scheduleDraft={draft.scheduleDraft}
      timeZoneLabel={currentTimeZoneLabel()}
      onScheduleDraftChange={(value) => patchSettings({ scheduleDraft: value })}
      onSchedule={handleSchedule}
      onClearSchedule={handleClearSchedule}
      isPremium={draft.isPremium}
      onTogglePremium={(value) => patchSettings({ isPremium: value })}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        slug: category.slug,
      }))}
      categoryId={draft.categoryId}
      onCategoryChange={(value) => patchSettings({ categoryId: value })}
      slug={draft.slug}
      onSlugChange={(value) => patchSettings({ slug: value })}
      subdomain={draft.subdomain}
      attributions={draft.attributions}
      onAttributionsChange={(value) => patchSettings({ attributions: value })}
      articleId={draft.id}
      seoTitle={draft.seoTitle}
      seoDescription={draft.seoDescription}
      autoSeoTitle={draft.title}
      autoSeoDescription=""
      onSeoTitleChange={(value) => patchSettings({ seoTitle: value })}
      onSeoDescriptionChange={(value) => patchSettings({ seoDescription: value })}
      allowPublicAnnotations={draft.allowPublicAnnotations}
      allowComments={draft.allowComments}
      onTogglePublicAnnotations={(value) => patchSettings({ allowPublicAnnotations: value })}
      onToggleComments={(value) => patchSettings({ allowComments: value })}
      allowDownload={draft.allowDownload}
      downloadSaving={false}
      onToggleDownload={(value) => patchSettings({ allowDownload: value })}
      canPublish={canPublish}
      onUnpublish={handleUnpublish}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 rounded-xl px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t`Annuler`}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t`Enregistrer`}
          </button>
        </div>
      }
    />
  );
}
