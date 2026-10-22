'use client';

import React from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Heart,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Repeat2,
  Trash2,
  XCircle,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';

import type { ArticleWithCategory, ListColumnPrefs } from './article-list-types';

export function ArticleListRow({
  article,
  columns,
  density,
  selected,
  pinned,
  about,
  canReview,
  onToggleSelect,
  onOpenAnalytics,
  onTogglePin,
  onOpenSettings,
  onToggleAbout,
  onReview,
  onDelete,
}: {
  article: ArticleWithCategory;
  columns: ListColumnPrefs;
  density: 'comfortable' | 'compact';
  selected: boolean;
  pinned: boolean;
  about: boolean;
  canReview: boolean;
  onToggleSelect: (id: string) => void;
  onOpenAnalytics: (article: ArticleWithCategory) => void;
  onTogglePin: (article: ArticleWithCategory) => void;
  onOpenSettings: (id: string) => void;
  onToggleAbout: (id: string) => void;
  onReview: (article: ArticleWithCategory, approve: boolean) => void;
  onDelete: (article: ArticleWithCategory) => void;
}) {
  const interactionsCount =
    (article._count?.bookmarks || 0) +
    (article._count?.highlights || 0) +
    (article._count?.letters || 0);

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
            (article.status === 'SUBMITTED' ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-highlight/20 bg-highlight/10 px-1.5 py-0.5 text-[10px] font-semibold text-highlight">
                <Clock className="h-2.5 w-2.5" />
                {t`En revue`}
              </span>
            ) : (
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
            ))}
          {columns.premium && article.isPremium && (
            <Lock className="h-3 w-3 shrink-0 text-highlight" />
          )}
          {pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
        </div>

        <div className="mt-0.5 flex items-center gap-2 font-sans text-[11px] text-muted-foreground">
          {columns.category && article.category && (
            <span className="max-w-40 truncate">
              {article.category.name?.trim() || article.category.slug}
            </span>
          )}
          {columns.category && article.category && columns.updatedAt && (
            <span className="text-border">·</span>
          )}
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

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenAnalytics(article);
        }}
        className="rounded p-1.5 text-muted-foreground opacity-60 transition-colors hover:text-foreground group-hover:opacity-100 focus:opacity-100"
        title={t`Voir les analyses`}
      >
        <BarChart3 className="h-4 w-4 stroke-[1.5]" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(article);
        }}
        className={cn(
          'rounded p-1.5 transition-colors hover:text-foreground',
          pinned
            ? 'text-primary'
            : 'text-muted-foreground opacity-60 group-hover:opacity-100 focus:opacity-100'
        )}
        title={pinned ? t`Retirer de la une` : t`Épingler à la une`}
      >
        <Pin className="h-4 w-4 stroke-[1.5]" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenSettings(article.id);
        }}
        className="rounded p-1.5 text-muted-foreground opacity-60 transition-colors hover:text-foreground group-hover:opacity-100 focus:opacity-100"
        title={t`Paramètres de l'article`}
      >
        <Edit3 className="h-4 w-4 stroke-[1.5]" />
      </button>

      <details className="relative">
        <summary
          className="list-none cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title={t`Plus d'actions`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-border/40 bg-card p-1 shadow-xl">
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
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-success transition-colors hover:bg-success/10"
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
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
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
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t`Supprimer`}
          </button>
        </div>
      </details>
    </div>
  );
}
