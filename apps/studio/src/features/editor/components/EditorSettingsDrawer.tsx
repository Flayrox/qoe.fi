'use client';

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Copy,
  CopyCheck,
  Download,
  FolderOpen,
  Globe,
  Highlighter,
  Loader2,
  Lock,
  MessageSquare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@qoe/ui/drawer';
import { Input, InputGroup, Textarea } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';
import { Switch } from '@qoe/ui/switch';
import { ArticleAttributionEditor, type ArticleAttributionDraft } from './ArticleAttributionEditor';
import { resolveArticleCategoryPath } from '../lib/article-settings';
import { formatScheduledAt } from '../lib/datetime';

export interface EditorSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  scheduleDraft: string;
  timeZoneLabel: string;
  onScheduleDraftChange: (value: string) => void;
  onSchedule: () => void;
  onClearSchedule: () => void;
  schedulePending?: boolean;
  isPremium: boolean;
  onTogglePremium: (value: boolean) => void;
  categories: { id: string; name: string; parentId?: string | null; slug?: string }[];
  categoryId: string | null;
  onCategoryChange: (value: string | null) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  subdomain?: string;
  attributions: ArticleAttributionDraft[];
  onAttributionsChange: (value: ArticleAttributionDraft[]) => void;
  articleId?: string;
  seoTitle: string;
  seoDescription: string;
  autoSeoTitle: string;
  autoSeoDescription: string;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
  allowPublicAnnotations: boolean;
  allowComments: boolean;
  onTogglePublicAnnotations: (value: boolean) => void;
  onToggleComments: (value: boolean) => void;
  allowDownload: boolean;
  downloadSaving: boolean;
  onToggleDownload: (value: boolean) => void;
  canPublish: boolean;
  hasUnpublishedChanges?: boolean;
  onUnpublish: () => void;
  onDiscardDraft?: () => void;
  /** Pied optionnel (ex. Enregistrer/Fermer depuis la liste d'articles). */
  footer?: React.ReactNode;
}

/** Valeur `datetime-local` (heure locale, sans secondes) pour un Date. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** Raccourcis de programmation : les trois moments réellement demandés. */
function schedulePresets(): { label: string; value: string }[] {
  const now = new Date();

  const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
  nextHour.setMinutes(0, 0, 0);

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);

  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysUntilMonday,
    9,
    0,
    0,
    0
  );

  return [
    { label: t`Dans 1 h`, value: toLocalInputValue(nextHour) },
    { label: t`Demain 9 h`, value: toLocalInputValue(tomorrow) },
    { label: t`Lundi 9 h`, value: toLocalInputValue(monday) },
  ];
}

/** « dans 3 h », « dans 2 j » — null si la date est passée ou invalide. */
function scheduleCountdown(iso: string): string | null {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMinutes = Math.round((target - Date.now()) / 60000);
  if (diffMinutes <= 0) return null;
  if (diffMinutes < 60) return t`Publication dans ${diffMinutes} min.`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return t`Publication dans ${hours} h.`;
  return t`Publication dans ${Math.round(hours / 24)} j.`;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans flex items-center gap-2">
      {icon}
      {children}
    </h4>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/15 p-3 hover:bg-muted/30 transition-colors">
      <Switch
        size="sm"
        isSelected={checked}
        isDisabled={disabled}
        onChange={onChange}
        label={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {icon}
            <span>{title}</span>
          </span>
        }
        description={<span className="text-[10px] leading-tight">{description}</span>}
        className="w-full items-center"
      />
    </div>
  );
}

export function EditorSettingsDrawer(props: EditorSettingsDrawerProps) {
  const {
    open,
    onClose,
    published,
    status,
    scheduledAt,
    scheduleDraft,
    timeZoneLabel,
    onScheduleDraftChange,
    onSchedule,
    onClearSchedule,
    schedulePending = false,
    isPremium,
    onTogglePremium,
    categories,
    categoryId,
    onCategoryChange,
    slug,
    onSlugChange,
    subdomain,
    attributions,
    onAttributionsChange,
    articleId,
    seoTitle,
    seoDescription,
    autoSeoTitle,
    autoSeoDescription,
    onSeoTitleChange,
    onSeoDescriptionChange,
    allowPublicAnnotations,
    allowComments,
    onTogglePublicAnnotations,
    onToggleComments,
    allowDownload,
    downloadSaving,
    onToggleDownload,
    canPublish,
    hasUnpublishedChanges,
    onUnpublish,
    onDiscardDraft,
    footer,
  } = props;

  const [slugCopied, setSlugCopied] = useState(false);
  const [seoAdvancedOpen, setSeoAdvancedOpen] = useState(Boolean(seoTitle || seoDescription));

  const articlePath = useMemo(
    () => resolveArticleCategoryPath(categories, categoryId),
    [categories, categoryId]
  );

  const hierarchicalCategories = useMemo(() => {
    const formatted = categories.map((category) => ({
      ...category,
      displayName: category.name?.trim() || category.slug || t`Catégorie sans titre`,
    }));
    const roots = formatted.filter((category) => !category.parentId);
    const childrenMap = new Map<string, typeof formatted>();
    for (const category of formatted) {
      if (category.parentId) {
        const list = childrenMap.get(category.parentId) || [];
        list.push(category);
        childrenMap.set(category.parentId, list);
      }
    }
    return { roots, childrenMap };
  }, [categories]);

  const scheduledLabel = formatScheduledAt(scheduledAt);

  if (!open) return null;

  return (
    <Drawer
      side="right"
      width="md"
      isOpen={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DrawerContent aria-label={t`Paramètres de l'article`}>
        <DrawerHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <DrawerTitle className="text-sm font-bold">{t`Paramètres de l'article`}</DrawerTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    published ? 'bg-success' : scheduledAt ? 'bg-highlight' : 'bg-muted-foreground'
                  )}
                />
                <span>
                  {published
                    ? t`En ligne (Publié)`
                    : scheduledAt
                      ? t`Programmé`
                      : status === 'SUBMITTED'
                        ? t`En revue`
                        : t`Brouillon privé`}
                </span>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="p-5 space-y-6">
          <section className="space-y-3">
            <SectionTitle icon={<FolderOpen className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Thématique & Catégorie`}
            </SectionTitle>
            <Select
              label={t`Catégorie`}
              hideLabel
              size="sm"
              value={categoryId || ''}
              onValueChange={(value) => onCategoryChange(value || null)}
              options={[
                { id: '', label: t`Non catégorisé` },
                ...hierarchicalCategories.roots
                  .filter(
                    (root) => (hierarchicalCategories.childrenMap.get(root.id) || []).length === 0
                  )
                  .map((root) => ({ id: root.id, label: root.displayName })),
              ]}
              groups={hierarchicalCategories.roots
                .filter(
                  (root) => (hierarchicalCategories.childrenMap.get(root.id) || []).length > 0
                )
                .map((root) => ({
                  label: root.displayName,
                  options: [
                    { id: root.id, label: root.displayName },
                    ...(hierarchicalCategories.childrenMap.get(root.id) || []).map((child) => ({
                      id: child.id,
                      label: child.displayName,
                    })),
                  ],
                }))}
            />
          </section>

          <section className="space-y-3 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between">
              <SectionTitle icon={<Globe className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
                {t`Adresse URL de l'écrit`}
              </SectionTitle>
              <Button
                variant="ghost"
                tone={slugCopied ? 'success' : 'brand'}
                size="xs"
                onClick={() => {
                  const fullUrl = `https://${subdomain ? `${subdomain}.qoe.fi` : 'qoe.fi'}${articlePath}/${slug || ''}`;
                  navigator.clipboard.writeText(fullUrl);
                  setSlugCopied(true);
                  setTimeout(() => setSlugCopied(false), 2000);
                }}
                className="h-auto px-1.5 py-0.5 text-[11px]"
              >
                {slugCopied ? (
                  <>
                    <CopyCheck />
                    <span>{t`Copié !`}</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>{t`Copier le lien`}</span>
                  </>
                )}
              </Button>
            </div>

            <InputGroup
              size="sm"
              left={<span className="select-none whitespace-nowrap text-xs">{articlePath}/</span>}
            >
              <Input
                type="text"
                size="sm"
                value={slug}
                onChange={(event) =>
                  onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                }
                placeholder="mon-titre-article"
              />
            </InputGroup>
          </section>

          {canPublish && (
            <section className="space-y-3 pt-4 border-t border-border/40">
              <SectionTitle
                icon={<CalendarClock className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}
              >
                {t`Date de publication`}
              </SectionTitle>

              {status === 'PUBLISHED' && !scheduledAt ? (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t`Cet article est en ligne. Le programmer le rendrait invisible jusqu'à la date choisie : dépubliez-le d'abord si vous voulez le repositionner dans le temps.`}
                </p>
              ) : (
                <>
                  {scheduledAt && scheduledLabel ? (
                    <div className="rounded-xl border border-highlight/30 bg-highlight/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-highlight">
                        {t`Programmé`}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{scheduledLabel}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {scheduleCountdown(scheduledAt) ??
                          t`Publication automatique à cette heure (${timeZoneLabel}).`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {t`Choisissez une date : l'article sera publié automatiquement à ce moment (heure locale ${timeZoneLabel}).`}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {schedulePresets().map((preset) => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="xs"
                        onClick={() => onScheduleDraftChange(preset.value)}
                        disabled={schedulePending}
                        className="rounded-full"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Input
                      type="datetime-local"
                      size="sm"
                      value={scheduleDraft}
                      onChange={(event) => onScheduleDraftChange(event.target.value)}
                      disabled={schedulePending}
                      className="flex-1"
                      aria-label={t`Date et heure de programmation`}
                    />
                    <Button
                      variant="solid"
                      tone="vivid"
                      size="sm"
                      onClick={onSchedule}
                      disabled={schedulePending}
                      className="shrink-0"
                    >
                      {schedulePending && <Loader2 className="animate-spin" />}
                      {schedulePending
                        ? t`Programmation…`
                        : scheduledAt
                          ? t`Reporter`
                          : t`Programmer`}
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                    {t`Tant que la date n'est pas passée, vous pouvez la déplacer autant de fois que nécessaire : chaque report est conservé dans l'historique.`}
                  </p>

                  {scheduledAt && (
                    <Button
                      variant="ghost"
                      tone="danger"
                      size="xs"
                      onClick={onClearSchedule}
                      disabled={schedulePending}
                      className="h-auto px-0 py-0.5 text-[11px] hover:bg-transparent hover:underline"
                    >
                      {t`Annuler la programmation`}
                    </Button>
                  )}
                </>
              )}
            </section>
          )}

          <section className="space-y-3 pt-4 border-t border-border/40">
            <ArticleAttributionEditor
              value={attributions}
              onChange={onAttributionsChange}
              articleId={articleId}
            />
          </section>

          <section className="space-y-4 pt-4 border-t border-border/40">
            <SectionTitle icon={<Search className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Référencement SEO & Social`}
            </SectionTitle>

            <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t`Aperçu automatique`}
              </p>
              <p className="text-sm font-medium text-primary line-clamp-1">
                {seoTitle.trim() || autoSeoTitle || t`Titre de l'article`}
              </p>
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                {seoDescription.trim() ||
                  autoSeoDescription ||
                  t`Description générée depuis le début de l'article.`}
              </p>
              <p className="text-[10px] text-muted-foreground/70 truncate">
                {`${subdomain ? `${subdomain}.qoe.fi` : 'qoe.fi'}${articlePath}/${slug || 'mon-titre-article'}`}
              </p>
            </div>

            <Button
              variant="ghost"
              tone="brand"
              size="xs"
              onClick={() => setSeoAdvancedOpen((value) => !value)}
              className="h-auto px-0 py-0.5 text-[11px] hover:bg-transparent hover:underline"
            >
              {seoAdvancedOpen ? t`Masquer la configuration avancée` : t`Personnaliser le SEO`}
            </Button>

            <div className={cn('space-y-3', seoAdvancedOpen ? 'block' : 'hidden')}>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  <label>{t`Titre SEO alternatif`}</label>
                  <span
                    className={cn(
                      seoTitle.length > 60 ? 'text-highlight' : 'text-muted-foreground'
                    )}
                  >
                    {seoTitle.length}/60
                  </span>
                </div>
                <Input
                  type="text"
                  size="sm"
                  value={seoTitle}
                  onChange={(event) => onSeoTitleChange(event.target.value)}
                  placeholder={autoSeoTitle || t`Titre de l'article`}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  <label>{t`Description Meta SEO`}</label>
                  <span
                    className={cn(
                      seoDescription.length > 160 ? 'text-highlight' : 'text-muted-foreground'
                    )}
                  >
                    {seoDescription.length}/160
                  </span>
                </div>
                <Textarea
                  size="sm"
                  rows={3}
                  value={seoDescription}
                  onChange={(event) => onSeoDescriptionChange(event.target.value)}
                  placeholder={
                    autoSeoDescription ||
                    t`Une courte accroche percutante pour Google et les partages sociaux...`
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-2.5 pt-4 border-t border-border/40">
            <SectionTitle icon={<Lock className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
              {t`Accès & Monétisation`}
            </SectionTitle>

            <ToggleRow
              icon={<Lock className="w-3.5 h-3.5 text-highlight" />}
              title={t`Article Paywall Premium`}
              description={t`Réservé aux membres disposant d'un abonnement payant.`}
              checked={isPremium}
              onChange={onTogglePremium}
            />
            <ToggleRow
              icon={<Highlighter className="w-3.5 h-3.5 text-primary" />}
              title={t`Annotations publiques`}
              description={t`Permet aux lecteurs de surligner et d'annoter publiquement vos phrases.`}
              checked={allowPublicAnnotations}
              onChange={onTogglePublicAnnotations}
            />
            <ToggleRow
              icon={<MessageSquare className="w-3.5 h-3.5 text-primary" />}
              title={t`Espace commentaires`}
              description={t`Ouvre un espace de débat et d'échange sous l'article.`}
              checked={allowComments}
              onChange={onToggleComments}
            />
            {articleId && (
              <ToggleRow
                icon={<Download className="w-3.5 h-3.5 text-primary" />}
                title={t`Téléchargement hors-ligne`}
                description={t`Autorise les lecteurs Plus à mettre cet article hors-ligne et dans leur file d'écoute.`}
                checked={allowDownload}
                disabled={downloadSaving}
                onChange={onToggleDownload}
              />
            )}
          </section>

          {published && hasUnpublishedChanges && onDiscardDraft && (
            <section className="space-y-2 pt-4 border-t border-destructive/20">
              <SectionTitle icon={<RotateCcw className="h-3.5 w-3.5 text-destructive-text" />}>
                {t`Modifications non publiées`}
              </SectionTitle>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t`Abandonner le brouillon réinitialise l'éditeur à la version actuellement visible par vos lecteurs.`}
              </p>
              <Button variant="outline" tone="danger" size="sm" onClick={onDiscardDraft}>
                <RotateCcw />
                {t`Abandonner les modifications`}
              </Button>
            </section>
          )}

          {published && canPublish && (
            <section className="space-y-2 pt-4 border-t border-destructive/20">
              <SectionTitle icon={<Trash2 className="h-3.5 w-3.5 text-destructive-text" />}>
                {t`Zone sensible`}
              </SectionTitle>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t`Dépublier retire immédiatement l'article du site public. Le contenu est conservé en brouillon.`}
              </p>
              <Button variant="outline" tone="danger" size="sm" onClick={onUnpublish}>
                {t`Dépublier l'article`}
              </Button>
            </section>
          )}
        </DrawerBody>

        {footer && <DrawerFooter className="justify-stretch">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}
