'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  X,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
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
    <label className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/15 hover:bg-muted/30 transition-colors cursor-pointer select-none">
      <div className="space-y-0.5 pr-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {icon}
          <span>{title}</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="w-4 h-4 rounded text-primary border-border/40 focus:ring-primary cursor-pointer shrink-0 disabled:opacity-40"
      />
    </label>
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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      <div
        className="fixed inset-0 bg-background/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={t`Paramètres de l'article`}
          className="w-screen max-w-md bg-card border-l border-border/50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground font-sans">
                  {t`Paramètres de l'article`}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      published
                        ? 'bg-success'
                        : scheduledAt
                          ? 'bg-highlight'
                          : 'bg-muted-foreground'
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
            <button
              type="button"
              onClick={onClose}
              aria-label={t`Fermer`}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <section className="space-y-3">
              <SectionTitle icon={<FolderOpen className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
                {t`Thématique & Catégorie`}
              </SectionTitle>
              <select
                value={categoryId || ''}
                onChange={(event) => onCategoryChange(event.target.value || null)}
                className="w-full bg-background border border-border/40 rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans cursor-pointer shadow-xs"
              >
                <option value="" className="bg-popover text-popover-foreground">
                  {t`Non catégorisé`}
                </option>
                {hierarchicalCategories.roots.map((root) => {
                  const children = hierarchicalCategories.childrenMap.get(root.id) || [];
                  if (children.length === 0) {
                    return (
                      <option key={root.id} value={root.id}>
                        {root.displayName}
                      </option>
                    );
                  }
                  return (
                    <optgroup key={root.id} label={root.displayName}>
                      <option value={root.id}>{root.displayName}</option>
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          ↳ {child.displayName}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </section>

            <section className="space-y-3 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <SectionTitle icon={<Globe className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}>
                  {t`Adresse URL de l'écrit`}
                </SectionTitle>
                <button
                  type="button"
                  onClick={() => {
                    const fullUrl = `https://${subdomain ? `${subdomain}.qoe.fi` : 'qoe.fi'}${articlePath}/${slug || ''}`;
                    navigator.clipboard.writeText(fullUrl);
                    setSlugCopied(true);
                    setTimeout(() => setSlugCopied(false), 2000);
                  }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  {slugCopied ? (
                    <>
                      <CopyCheck className="w-3 h-3 text-success" />
                      <span className="text-success">{t`Copié !`}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{t`Copier le lien`}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center bg-background border border-border/40 rounded-xl px-3 py-2 text-xs font-sans text-muted-foreground focus-within:border-primary transition-colors">
                <span className="text-muted-foreground/60 select-none whitespace-nowrap">
                  {articlePath}/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(event) =>
                    onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                  }
                  placeholder="mon-titre-article"
                  className="flex-1 bg-transparent border-0 p-0 text-xs font-sans font-medium text-foreground focus:outline-none ml-0.5"
                />
              </div>
            </section>

            {canPublish && (
              <section className="space-y-3 pt-4 border-t border-border/40">
                <SectionTitle
                  icon={<CalendarClock className="h-3.5 w-3.5 text-primary stroke-[1.5]" />}
                >
                  {t`Date de publication`}
                </SectionTitle>

                {status === 'PUBLISHED' && !scheduledAt ? (
                  // Programmer un article en ligne le retirerait du site : le
                  // serveur refuse (errAlreadyPublished). On l'explique ici
                  // plutôt que d'afficher un formulaire qui échouera.
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
                        <p className="mt-0.5 text-sm font-medium text-foreground">
                          {scheduledLabel}
                        </p>
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
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onScheduleDraftChange(preset.value)}
                          disabled={schedulePending}
                          className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="datetime-local"
                        value={scheduleDraft}
                        onChange={(event) => onScheduleDraftChange(event.target.value)}
                        disabled={schedulePending}
                        className="h-8 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground disabled:opacity-50"
                        aria-label={t`Date et heure de programmation`}
                      />
                      <button
                        type="button"
                        onClick={onSchedule}
                        disabled={schedulePending}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-highlight px-2.5 text-xs font-semibold text-highlight-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {schedulePending && <Loader2 className="h-3 w-3 animate-spin" />}
                        {schedulePending
                          ? t`Programmation…`
                          : scheduledAt
                            ? t`Reporter`
                            : t`Programmer`}
                      </button>
                    </div>

                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                      {t`Tant que la date n'est pas passée, vous pouvez la déplacer autant de fois que nécessaire : chaque report est conservé dans l'historique.`}
                    </p>

                    {scheduledAt && (
                      <button
                        type="button"
                        onClick={onClearSchedule}
                        disabled={schedulePending}
                        className="text-[11px] text-destructive hover:underline disabled:opacity-50"
                      >
                        {t`Annuler la programmation`}
                      </button>
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

              <button
                type="button"
                onClick={() => setSeoAdvancedOpen((value) => !value)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {seoAdvancedOpen ? t`Masquer la configuration avancée` : t`Personnaliser le SEO`}
              </button>

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
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(event) => onSeoTitleChange(event.target.value)}
                    placeholder={autoSeoTitle || t`Titre de l'article`}
                    className="w-full bg-background border border-border/40 rounded-xl p-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors font-sans"
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
                  <textarea
                    rows={3}
                    value={seoDescription}
                    onChange={(event) => onSeoDescriptionChange(event.target.value)}
                    placeholder={
                      autoSeoDescription ||
                      t`Une courte accroche percutante pour Google et les partages sociaux...`
                    }
                    className="w-full bg-background border border-border/40 rounded-xl p-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors font-sans resize-none"
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
                <SectionTitle icon={<RotateCcw className="h-3.5 w-3.5 text-destructive" />}>
                  {t`Modifications non publiées`}
                </SectionTitle>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t`Abandonner le brouillon réinitialise l'éditeur à la version actuellement visible par vos lecteurs.`}
                </p>
                <button
                  type="button"
                  onClick={onDiscardDraft}
                  className="h-8 px-3 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  {t`Abandonner les modifications`}
                </button>
              </section>
            )}

            {published && canPublish && (
              <section className="space-y-2 pt-4 border-t border-destructive/20">
                <SectionTitle icon={<Trash2 className="h-3.5 w-3.5 text-destructive" />}>
                  {t`Zone sensible`}
                </SectionTitle>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t`Dépublier retire immédiatement l'article du site public. Le contenu est conservé en brouillon.`}
                </p>
                <button
                  type="button"
                  onClick={onUnpublish}
                  className="h-8 px-3 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/10 transition-colors"
                >
                  {t`Dépublier l'article`}
                </button>
              </section>
            )}
          </div>
          {footer && <div className="shrink-0 border-t border-border/40 p-4">{footer}</div>}
        </aside>
      </div>
    </div>
  );
}
