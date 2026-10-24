'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@qoe/ui';
import { Select } from '@qoe/ui/select';
import { bulkUpdateArticlesAction, type BulkUpdateArticlesInput } from '@qoe/sdk/actions/articles';

import type { CategoryWithCount } from './article-list-types';
import type { ConfirmAction } from './confirm-action-dialog';

type TriState = 'keep' | 'on' | 'off';

interface BulkSettingsDraft {
  category: string;
  premium: TriState;
  comments: TriState;
  annotations: TriState;
  download: TriState;
  publication: 'keep' | 'publish' | 'unpublish';
}

const EMPTY_BULK_SETTINGS: BulkSettingsDraft = {
  category: 'keep',
  premium: 'keep',
  comments: 'keep',
  annotations: 'keep',
  download: 'keep',
  publication: 'keep',
};

function BulkTriRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: TriState;
  onChange: (value: TriState) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/15 p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[10px] leading-tight text-muted-foreground">{description}</p>
      </div>
      <Select
        label={label}
        hideLabel
        size="sm"
        className="w-36 shrink-0"
        value={value}
        onValueChange={(next) => onChange(next as TriState)}
        options={[
          { id: 'keep', label: t`Ne pas modifier` },
          { id: 'on', label: t`Activer` },
          { id: 'off', label: t`Désactiver` },
        ]}
      />
    </div>
  );
}

export function ArticleBulkSettingsDialog({
  open,
  onOpenChange,
  selectedIds,
  selectedCount,
  categories,
  onApplied,
  onRequestConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  selectedCount: number;
  categories: CategoryWithCount[];
  onApplied: () => Promise<void> | void;
  onRequestConfirm: (action: ConfirmAction) => void;
}) {
  const [settings, setSettings] = useState<BulkSettingsDraft>(EMPTY_BULK_SETTINGS);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (open) setSettings(EMPTY_BULK_SETTINGS);
  }, [open]);

  const rootCategories = categories.filter((category) => !category.parentId);

  const apply = async () => {
    if (selectedIds.length === 0) return;
    const input: BulkUpdateArticlesInput = { ids: selectedIds };
    if (settings.category !== 'keep') {
      input.setCategory = true;
      input.categoryId = settings.category === 'default' ? null : settings.category;
    }
    if (settings.premium !== 'keep') input.isPremium = settings.premium === 'on';
    if (settings.comments !== 'keep') input.allowComments = settings.comments === 'on';
    if (settings.annotations !== 'keep')
      input.allowPublicAnnotations = settings.annotations === 'on';
    if (settings.download !== 'keep') input.allowDownload = settings.download === 'on';
    if (settings.publication === 'publish') input.published = true;
    if (settings.publication === 'unpublish') input.published = false;

    const hasChange =
      input.setCategory ||
      input.isPremium !== undefined ||
      input.allowComments !== undefined ||
      input.allowPublicAnnotations !== undefined ||
      input.allowDownload !== undefined ||
      input.published !== undefined;
    if (!hasChange) {
      toast.error(t`Choisissez au moins un paramètre à modifier.`);
      return;
    }

    setApplying(true);
    try {
      const res = await bulkUpdateArticlesAction(input);
      if (!res.ok) throw new Error(res.error.message);
      const { updated, failed } = res.data;
      if (updated > 0) {
        toast.success(
          `${updated} ${updated > 1 ? t`articles mis à jour` : t`article mis à jour`}.`
        );
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} ${
            failed.length > 1
              ? t`articles n'ont pas pu être modifiés`
              : t`article n'a pas pu être modifié`
          }.`
        );
      }
      onOpenChange(false);
      await onApplied();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Échec de la modification groupée.`);
    } finally {
      setApplying(false);
    }
  };

  const handleApply = () => {
    if (settings.publication === 'keep') {
      void apply();
      return;
    }
    const publish = settings.publication === 'publish';
    onRequestConfirm({
      title: publish
        ? t`Publier ${selectedCount} article(s) ?`
        : t`Dépublier ${selectedCount} article(s) ?`,
      description: publish
        ? t`Les articles sélectionnés seront immédiatement visibles publiquement.`
        : t`Les articles sélectionnés seront immédiatement retirés du site public et repasseront en brouillon.`,
      confirmLabel: publish ? t`Publier` : t`Dépublier`,
      destructive: !publish,
      onConfirm: apply,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!applying) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-bold">
            {t`Modifier ${selectedCount} article(s)`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t`Seuls les paramètres que vous changez ici seront appliqués. Le contenu n'est jamais modifié.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Select
            label={t`Catégorie`}
            hideLabel
            size="sm"
            value={settings.category}
            onValueChange={(category) => setSettings((prev) => ({ ...prev, category }))}
            options={[
              { id: 'keep', label: t`Ne pas modifier` },
              { id: 'default', label: t`Non catégorisé` },
              ...rootCategories.flatMap((root) => [
                { id: root.id, label: root.name?.trim() || root.slug },
                ...categories
                  .filter((category) => category.parentId === root.id)
                  .map((sub) => ({ id: sub.id, label: `↳ ${sub.name?.trim() || sub.slug}` })),
              ]),
            ]}
          />

          <BulkTriRow
            label={t`Article Premium`}
            description={t`Réserver aux abonnés payants.`}
            value={settings.premium}
            onChange={(value) => setSettings((prev) => ({ ...prev, premium: value }))}
          />
          <BulkTriRow
            label={t`Commentaires`}
            description={t`Ouvrir ou fermer l'espace de débat.`}
            value={settings.comments}
            onChange={(value) => setSettings((prev) => ({ ...prev, comments: value }))}
          />
          <BulkTriRow
            label={t`Annotations publiques`}
            description={t`Autoriser les lecteurs à surligner et annoter.`}
            value={settings.annotations}
            onChange={(value) => setSettings((prev) => ({ ...prev, annotations: value }))}
          />
          <BulkTriRow
            label={t`Téléchargement hors-ligne`}
            description={t`Autoriser les lecteurs Plus à télécharger.`}
            value={settings.download}
            onChange={(value) => setSettings((prev) => ({ ...prev, download: value }))}
          />

          <div className="space-y-1.5">
            <Select
              label={t`Publication`}
              hideLabel
              size="sm"
              value={settings.publication}
              onValueChange={(publication) =>
                setSettings((prev) => ({
                  ...prev,
                  publication: publication as BulkSettingsDraft['publication'],
                }))
              }
              options={[
                { id: 'keep', label: t`Ne pas modifier` },
                { id: 'publish', label: t`Publier` },
                { id: 'unpublish', label: t`Dépublier (brouillon)` },
              ]}
            />
            {settings.publication !== 'keep' && (
              <p className="flex items-start gap-1.5 rounded-lg border border-highlight/20 bg-highlight/10 p-2 text-[10px] text-highlight">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {settings.publication === 'publish'
                  ? t`Les articles seront immédiatement visibles publiquement.`
                  : t`Les articles seront immédiatement retirés du site public.`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={applying}
            className="h-9 rounded-xl px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t`Annuler`}
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t`Appliquer`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
