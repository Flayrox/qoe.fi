'use client';

import React, { useState } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  GitCompare,
  Heart,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Repeat2,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { Button } from '@qoe/ui/button';
import { toast } from '@qoe/ui/toast';
import { bulkUpdateArticlesAction } from '@qoe/sdk/actions/articles';
import { t } from '@lingui/core/macro';

import type { ArticleWithCategory, ListColumnPrefs } from './article-list-types';

/** « 25 oct. 09:00 » — date de programmation, ou null si invalide/absente. */
function formatScheduleDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ArticleListRow({
  article,
  columns,
  density,
  selected,
  pinned,
  about,
  canReview,
  canEditPersonalProfile = true,
  onToggleSelect,
  onOpenAnalytics,
  onTogglePin,
  onOpenSettings,
  onToggleAbout,
  onReview,
  onDelete,
  onOpenDiff,
}: {
  article: ArticleWithCategory;
  columns: ListColumnPrefs;
  density: 'comfortable' | 'compact';
  selected: boolean;
  pinned: boolean;
  about: boolean;
  canReview: boolean;
  /** Seul l'auteur peut décider de la présence de l'article sur son blog personnel. */
  canEditPersonalProfile?: boolean;
  onToggleSelect: (id: string) => void;
  onOpenAnalytics: (article: ArticleWithCategory) => void;
  onTogglePin: (article: ArticleWithCategory) => void;
  onOpenSettings: (id: string) => void;
  onToggleAbout: (id: string) => void;
  onReview: (article: ArticleWithCategory, approve: boolean) => void;
  onDelete: (article: ArticleWithCategory) => void;
  onOpenDiff?: (article: ArticleWithCategory) => void;
}) {
  const interactionsCount =
    (article._count?.bookmarks || 0) +
    (article._count?.highlights || 0) +
    (article._count?.letters || 0);
  const scheduledLabel = formatScheduleDate(article.scheduledAt);
  const [showOnPersonal, setShowOnPersonal] = useState(article.showOnPersonalProfile ?? true);

  const handleTogglePersonalProfile = async () => {
    const nextValue = !showOnPersonal;
    setShowOnPersonal(nextValue);
    const res = await bulkUpdateArticlesAction({
      ids: [article.id],
      showOnPersonalProfile: nextValue,
    });
    if (!res.ok || res.data.failed.includes(article.id)) {
      setShowOnPersonal(!nextValue);
      toast.error(!res.ok ? res.error.message : t`Action impossible`);
      return;
    }
    toast.success(
      nextValue
        ? t`Affiché sur votre profil et blog personnel`
        : t`Masqué de votre profil et blog personnel`
    );
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-lg border-b border-border/30 px-3 transition-colors hover:bg-muted/30',
        density === 'compact' ? 'py-2' : 'py-3.5',
        selected && 'bg-primary/5'
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(event) => {
          event.stopPropagation();
          onToggleSelect(article.id);
        }}
        onClick={(event) => event.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0 rounded border-border/40 text-primary focus:ring-primary"
        aria-label={t`Sélectionner ${article.title}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={`/articles/${article.id}`}
            className="truncate font-sans text-sm font-medium text-foreground transition-colors group-hover:text-primary"
          >
            {article.title}
          </a>
          {columns.status &&
            (article.status === 'SCHEDULED' ? (
              // Un article programmé n'est PAS un brouillon : il partira seul.
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded border border-success/25 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success-text"
                title={t`Publication automatique programmée`}
              >
                <CalendarClock className="h-2.5 w-2.5" />
                {t`Programmé`}
                {scheduledLabel && (
                  <span className="font-normal opacity-80">· {scheduledLabel}</span>
                )}
              </span>
            ) : article.status === 'SUBMITTED' ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-highlight/20 bg-highlight/10 px-1.5 py-0.5 text-[10px] font-semibold text-highlight">
                <Clock className="h-2.5 w-2.5" />
                {article.published ? t`En revue (modifications)` : t`En revue`}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                    article.published
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {article.published ? t`Publié` : t`Brouillon`}
                </span>
                {article.published && article.hasUnpublishedChanges && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-highlight/30 bg-highlight/10 px-1.5 py-0.5 text-[10px] font-medium text-highlight"
                    title={t`Brouillon avec des modifications non publiées`}
                  >
                    <GitCompare className="h-2.5 w-2.5" />
                    {t`Modifications en attente`}
                  </span>
                )}
              </div>
            ))}
          {columns.premium && article.isPremium && (
            <Lock className="h-3 w-3 shrink-0 text-highlight" />
          )}
          {article.publication?.type === 'MEDIA' && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={article.publication.name}
            >
              <Building2 className="h-2.5 w-2.5 text-primary" />
              <span className="max-w-28 truncate">{article.publication.name}</span>
            </span>
          )}
          {pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
        </div>

        <div className="mt-0.5 flex items-center gap-2 font-sans text-[11px] text-muted-foreground">
          {columns.category && (
            <span
              className={cn(
                'max-w-40 truncate',
                !article.category && 'italic text-muted-foreground/75'
              )}
            >
              {article.category?.name?.trim() || article.category?.slug || t`Non catégorisé`}
            </span>
          )}
          {columns.category && columns.updatedAt && <span className="text-border">·</span>}
          {columns.updatedAt && (
            <span className="shrink-0">
              {new Date(article.updatedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <span className="text-border">·</span>
            <Heart className="h-3 w-3" />
            {article.likesCount ?? 0}
          </span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <span className="text-border">·</span>
            <Repeat2 className="h-3 w-3" />
            {article.repostsCount ?? 0}
          </span>
          {columns.views && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <span className="text-border">·</span>
              <Eye className="h-3 w-3" />
              {article.views ?? 0}
            </span>
          )}
          {columns.comments && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <span className="text-border">·</span>
              <MessageSquare className="h-3 w-3" />
              {article.commentsCount ?? interactionsCount}
            </span>
          )}
          {about && <span className="shrink-0 text-primary/80">· {t`À propos`}</span>}
        </div>
      </div>

      <Button
        variant="ghost"
        size="xs"
        shape="icon"
        onClick={(event) => {
          event.stopPropagation();
          onOpenAnalytics(article);
        }}
        className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
        title={t`Voir les analyses`}
        aria-label={t`Voir les analyses`}
      >
        <BarChart3 />
      </Button>
      <Button
        variant="ghost"
        size="xs"
        shape="icon"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(article);
        }}
        className={cn(
          pinned
            ? 'text-primary'
            : 'text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100'
        )}
        title={pinned ? t`Retirer de la une` : t`Épingler à la une`}
        aria-label={pinned ? t`Retirer de la une` : t`Épingler à la une`}
      >
        <Pin />
      </Button>
      {(article.hasUnpublishedChanges || article.status === 'SUBMITTED') && onOpenDiff ? (
        <Button
          variant="ghost"
          size="xs"
          shape="icon"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDiff(article);
          }}
          className="text-highlight opacity-80 hover:opacity-100 group-hover:opacity-100 focus:opacity-100"
          title={t`Comparer les versions (Diff)`}
          aria-label={t`Comparer les versions`}
        >
          <GitCompare />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        shape="icon"
        onClick={(event) => {
          event.stopPropagation();
          onOpenSettings(article.id);
        }}
        className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
        title={t`Paramètres de l'article`}
        aria-label={t`Paramètres de l'article`}
      >
        <Edit3 />
      </Button>

      <details className="relative">
        <summary
          className="list-none cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title={t`Plus d'actions`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-border/40 bg-card p-1 shadow-xl">
          {(article.hasUnpublishedChanges || article.status === 'SUBMITTED') && onOpenDiff && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                (
                  event.currentTarget.closest('details') as HTMLDetailsElement | null
                )?.removeAttribute('open');
                onOpenDiff(article);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-muted/60"
            >
              <GitCompare className="h-3.5 w-3.5 text-highlight" />
              {t`Comparer les versions (Diff)`}
            </button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              (
                event.currentTarget.closest('details') as HTMLDetailsElement | null
              )?.removeAttribute('open');
              onOpenSettings(article.id);
            }}
            className="w-full justify-start gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
            <span>{t`Transférer de publication…`}</span>
          </Button>
          {canEditPersonalProfile && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                (
                  event.currentTarget.closest('details') as HTMLDetailsElement | null
                )?.removeAttribute('open');
                void handleTogglePersonalProfile();
              }}
              className="w-full justify-start gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground"
            >
              <UserRound className="h-3.5 w-3.5 text-primary" />
              <span>
                {showOnPersonal
                  ? t`Masquer du profil personnel`
                  : t`Afficher sur le profil personnel`}
              </span>
            </Button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              (
                event.currentTarget.closest('details') as HTMLDetailsElement | null
              )?.removeAttribute('open');
              onToggleAbout(article.id);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-foreground transition-colors hover:bg-muted/60"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {about ? t`Retirer de la page À propos` : t`Définir comme page À propos`}
          </button>
          {canReview && article.status === 'SUBMITTED' && (
            <>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  (
                    event.currentTarget.closest('details') as HTMLDetailsElement | null
                  )?.removeAttribute('open');
                  onReview(article, true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-success-text transition-colors hover:bg-success/10"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t`Approuver et publier`}
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  (
                    event.currentTarget.closest('details') as HTMLDetailsElement | null
                  )?.removeAttribute('open');
                  onReview(article, false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-destructive-text transition-colors hover:bg-destructive/10"
              >
                <XCircle className="h-3.5 w-3.5" />
                {t`Rejeter`}
              </button>
            </>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              (
                event.currentTarget.closest('details') as HTMLDetailsElement | null
              )?.removeAttribute('open');
              onDelete(article);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-destructive-text transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t`Supprimer`}
          </button>
        </div>
      </details>
    </div>
  );
}
