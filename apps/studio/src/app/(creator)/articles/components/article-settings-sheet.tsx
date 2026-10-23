'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { EditorSettingsDrawer } from '@/features/editor/components/EditorSettingsDrawer';
import { useArticleSettings } from '@/features/editor/hooks/useArticleSettings';
import { computeAutoSeoDescription } from '@/features/editor/lib/article-settings';
import { currentTimeZoneLabel } from '@/features/editor/lib/datetime';

import type { CategoryWithCount } from './article-list-types';
import type { ConfirmAction } from './confirm-action-dialog';

function SettingsOverlay({
  onClose,
  subtitle,
  children,
}: {
  onClose: () => void;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      <div
        className="fixed inset-0 bg-background/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-10">
        <aside className="flex w-screen max-w-md flex-col border-l border-border/50 bg-card shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-xs">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-sans text-sm font-bold text-foreground">
                  {t`Paramètres de l'article`}
                </h3>
                <p className="text-[11px] text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t`Fermer`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </aside>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex-1 space-y-6 overflow-hidden p-5" aria-busy="true">
      <div className="flex items-center justify-center gap-2 pt-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t`Chargement des paramètres…`}
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className="space-y-3">
          <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted/60" />
        </div>
      ))}
    </div>
  );
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
  const {
    draft,
    loadState,
    error,
    saving,
    scheduling,
    downloadSaving,
    lastSavedAt,
    dirty,
    patchDraft,
    resetDraft,
    save,
    schedule,
    clearSchedule,
    unpublish,
    toggleDownload,
    retry,
  } = useArticleSettings({ articleId, onSaved });

  const timeZoneLabel = useMemo(() => currentTimeZoneLabel(), []);
  const drawerCategories = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        slug: category.slug,
      })),
    [categories]
  );

  const requestClose = useCallback(() => {
    if (saving || scheduling) return;
    if (!dirty) {
      onClose();
      return;
    }
    onRequestConfirm({
      title: t`Fermer sans enregistrer ?`,
      description: t`Les modifications apportées aux paramètres de cet article seront perdues.`,
      confirmLabel: t`Fermer sans enregistrer`,
      destructive: true,
      onConfirm: onClose,
    });
  }, [dirty, onClose, onRequestConfirm, saving, scheduling]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !saving && loadState === 'ready') void save();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dirty, loadState, requestClose, save, saving]);

  const autoSeoDescription = useMemo(
    () => (draft ? computeAutoSeoDescription(draft.content, draft.isPremium) : ''),
    [draft]
  );

  if (loadState === 'loading') {
    return (
      <SettingsOverlay onClose={onClose} subtitle={t`Chargement sécurisé…`}>
        <SettingsSkeleton />
      </SettingsOverlay>
    );
  }

  if (loadState === 'error' || !draft) {
    return (
      <SettingsOverlay onClose={onClose} subtitle={t`Une erreur est survenue`}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-destructive/25 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">
              {t`Impossible de charger les paramètres`}
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              {error || t`Réessayez dans un instant.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void retry()}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t`Réessayer`}
          </button>
        </div>
      </SettingsOverlay>
    );
  }

  const savedLabel = lastSavedAt
    ? t`Enregistré à ${lastSavedAt.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : t`À jour`;

  return (
    <EditorSettingsDrawer
      open
      onClose={requestClose}
      published={draft.published}
      status={draft.status}
      scheduledAt={draft.scheduledAt}
      scheduleDraft={draft.scheduleDraft}
      timeZoneLabel={timeZoneLabel}
      onScheduleDraftChange={(value) => patchDraft({ scheduleDraft: value })}
      onSchedule={() => void schedule()}
      onClearSchedule={() => void clearSchedule()}
      schedulePending={scheduling}
      isPremium={draft.isPremium}
      onTogglePremium={(value) => patchDraft({ isPremium: value })}
      categories={drawerCategories}
      categoryId={draft.categoryId}
      onCategoryChange={(value) => patchDraft({ categoryId: value })}
      slug={draft.slug}
      onSlugChange={(value) => patchDraft({ slug: value })}
      subdomain={draft.subdomain}
      attributions={draft.attributions}
      onAttributionsChange={(value) => patchDraft({ attributions: value })}
      articleId={draft.id}
      seoTitle={draft.seoTitle}
      seoDescription={draft.seoDescription}
      autoSeoTitle={draft.title}
      autoSeoDescription={autoSeoDescription}
      onSeoTitleChange={(value) => patchDraft({ seoTitle: value })}
      onSeoDescriptionChange={(value) => patchDraft({ seoDescription: value })}
      allowPublicAnnotations={draft.allowPublicAnnotations}
      allowComments={draft.allowComments}
      onTogglePublicAnnotations={(value) => patchDraft({ allowPublicAnnotations: value })}
      onToggleComments={(value) => patchDraft({ allowComments: value })}
      allowDownload={draft.allowDownload}
      downloadSaving={downloadSaving}
      onToggleDownload={(value) => void toggleDownload(value)}
      canPublish={canPublish}
      onUnpublish={() =>
        onRequestConfirm({
          title: t`Dépublier cet article ?`,
          description: t`Il sera immédiatement retiré du site public et repassera en brouillon. Le contenu est conservé.`,
          confirmLabel: t`Dépublier`,
          destructive: true,
          onConfirm: async () => {
            const success = await unpublish();
            if (success) onClose();
          },
        })
      }
      footer={
        <div className="space-y-2.5">
          <div className="flex min-h-4 items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-1.5">
              {error ? (
                <>
                  <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                  <span className="line-clamp-2 text-destructive">{error}</span>
                </>
              ) : dirty ? (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" />
                  <span className="font-medium text-highlight">
                    {t`Modifications non enregistrées`}
                  </span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 shrink-0 text-success" />
                  <span className="text-muted-foreground">{savedLabel}</span>
                </>
              )}
            </div>
            {dirty && (
              <button
                type="button"
                onClick={resetDraft}
                disabled={saving || scheduling}
                className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {t`Réinitialiser`}
              </button>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={requestClose}
              disabled={saving || scheduling}
              className="h-9 rounded-xl px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t`Fermer`}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || scheduling || !dirty}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                dirty
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : dirty ? null : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saving ? t`Enregistrement…` : dirty ? t`Enregistrer` : t`Enregistré`}
            </button>
          </div>
        </div>
      }
    />
  );
}
