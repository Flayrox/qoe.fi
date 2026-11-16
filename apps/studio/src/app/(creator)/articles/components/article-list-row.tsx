'use client';

import React, { useState } from 'react';
import { cn } from '@qoe/utils';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import { Icon } from '@qoe/ui/icons';
import { IconButton } from '@qoe/ui/icon-button';
import { StatusDot } from '@qoe/ui/status-dot';
import { toast } from '@qoe/ui/toast';
import { bulkUpdateArticlesAction } from '@qoe/sdk/actions/articles';
import { t } from '@lingui/core/macro';
import { RecoverArticleModal } from '@/features/editor/components/RecoverArticleModal';

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

/** Ferme le menu `<details>` ouvert par le clic sur une action. */
function closeMenu(event: React.MouseEvent<HTMLElement>) {
  (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
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
  const [recoverModalOpen, setRecoverModalOpen] = useState(false);

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

  const menuItemClass =
    'w-full justify-start gap-2 rounded-lg px-2.5 py-2 text-xs font-normal text-foreground';

  const diffLabel = t`Comparer les versions (Diff)` as string;

  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-lg border-b border-border/30 px-3 transition-colors hover:bg-muted/30',
        density === 'compact' ? 'py-2' : 'py-3.5',
        selected && 'bg-primary/5'
      )}
    >
      <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          size="sm"
          isSelected={selected}
          onChange={() => onToggleSelect(article.id)}
          aria-label={t`Sélectionner ${article.title}`}
        />
      </span>

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
              <Badge
                variant="soft"
                tone="success"
                size="sm"
                className="shrink-0 gap-1 text-[10px]"
                title={t`Publication automatique programmée`}
              >
                <Icon name="calendar-clock" size="xs" />
                {t`Programmé`}
                {scheduledLabel && (
                  <span className="font-normal opacity-80">· {scheduledLabel}</span>
                )}
              </Badge>
            ) : article.status === 'SUBMITTED' ? (
              <Badge variant="soft" tone="brand" size="sm" className="shrink-0 gap-1 text-[10px]">
                <Icon name="clock" size="xs" />
                {article.published ? t`En revue (modifications)` : t`En revue`}
              </Badge>
            ) : (
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusDot
                  tone={article.published ? 'success' : 'neutral'}
                  label={article.published ? t`Publié` : t`Brouillon`}
                />
                {article.published && article.hasUnpublishedChanges && (
                  <Badge
                    variant="soft"
                    tone="brand"
                    size="sm"
                    className="shrink-0 gap-1 text-[10px]"
                    title={t`Brouillon avec des modifications non publiées`}
                  >
                    <Icon name="git-compare" size="xs" />
                    {t`Modifications en attente`}
                  </Badge>
                )}
              </div>
            ))}
          {columns.premium && article.isPremium && (
            <Icon name="lock" size="xs" className="shrink-0 text-highlight" />
          )}
          {article.publisher?.type === 'MEDIA' && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-control border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title={article.publisher.name}
            >
              <Icon name="building" size="xs" className="text-primary" />
              <span className="max-w-28 truncate">{article.publisher.name}</span>
            </span>
          )}
          {article.isAuthorSovereignCopy && article.originPublisher && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-control border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              title={t`Exemplaire personnel issu de ${article.originPublisher.name}`}
            >
              <Icon name="shield-check" size="xs" />
              <span className="max-w-36 truncate">
                {t`Version personnelle · ${article.originPublisher.name}`}
              </span>
            </span>
          )}
          {article.canEdit === false && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-control border border-muted bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t`Lecture seule`}
            </span>
          )}
          {article.sovereignCopyId ? (
            <a
              href={`/articles/${article.sovereignCopyId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 rounded-control border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
              title={t`Ouvrir votre exemplaire personnel de cet essai`}
            >
              <Icon name="git-fork" size="xs" />
              <span>{t`Ma version`}</span>
            </a>
          ) : article.publisher?.type === 'MEDIA' ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setRecoverModalOpen(true);
              }}
              className="h-5 gap-1 border-highlight/30 bg-highlight/10 px-1.5 text-[10px] font-medium text-highlight hover:bg-highlight/20"
              title={t`Créer ou importer un exemplaire personnel éditable.`}
            >
              <Icon name="git-fork" size="xs" />
              <span>{t`Récupérer ma version`}</span>
            </Button>
          ) : null}
          {pinned && <Icon name="pin" size="xs" className="shrink-0 text-primary" />}
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
            <Icon name="heart" size="xs" />
            {article.likesCount ?? 0}
          </span>
          <span className="flex shrink-0 items-center gap-1 tabular-nums">
            <span className="text-border">·</span>
            <Icon name="repeat" size="xs" />
            {article.repostsCount ?? 0}
          </span>
          {columns.views && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <span className="text-border">·</span>
              <Icon name="eye" size="xs" />
              {article.views ?? 0}
            </span>
          )}
          {columns.comments && (
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              <span className="text-border">·</span>
              <Icon name="message-square" size="xs" />
              {article.commentsCount ?? interactionsCount}
            </span>
          )}
          {about && <span className="shrink-0 text-primary/80">· {t`À propos`}</span>}
        </div>
      </div>

      <IconButton
        label={t`Voir les analyses`}
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onOpenAnalytics(article);
        }}
        className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
      >
        <Icon name="chart-column" />
      </IconButton>
      <IconButton
        label={pinned ? t`Retirer de la une` : t`Épingler à la une`}
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(article);
        }}
        className={cn(
          pinned
            ? 'text-primary'
            : 'text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100'
        )}
      >
        <Icon name="pin" />
      </IconButton>
      {(article.hasUnpublishedChanges || article.status === 'SUBMITTED') && onOpenDiff ? (
        <IconButton
          label={diffLabel}
          size="xs"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDiff(article);
          }}
          className="text-highlight opacity-80 hover:opacity-100 group-hover:opacity-100 focus:opacity-100"
        >
          <Icon name="git-compare" />
        </IconButton>
      ) : null}
      <IconButton
        label={t`Paramètres de l'article`}
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onOpenSettings(article.id);
        }}
        className="text-muted-foreground opacity-60 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
      >
        <Icon name="pen-line" />
      </IconButton>

      <details className="relative">
        <summary
          className="list-none cursor-pointer rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          title={t`Plus d'actions`}
        >
          <Icon name="more-horizontal" />
        </summary>
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-panel border border-border/40 bg-card p-1 shadow-xl">
          {(article.hasUnpublishedChanges || article.status === 'SUBMITTED') && onOpenDiff && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu(event);
                onOpenDiff(article);
              }}
              className={menuItemClass}
            >
              <Icon name="git-compare" size="sm" className="text-highlight" />
              {diffLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu(event);
              onOpenSettings(article.id);
            }}
            className={menuItemClass}
          >
            <Icon name="arrow-left-right" size="sm" className="text-primary" />
            <span>{t`Transférer de publication…`}</span>
          </Button>
          {canEditPersonalProfile && (
            <Button
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                closeMenu(event);
                void handleTogglePersonalProfile();
              }}
              className={menuItemClass}
            >
              <Icon name="user" size="sm" className="text-primary" />
              <span>
                {showOnPersonal
                  ? t`Masquer du profil personnel`
                  : t`Afficher sur le profil personnel`}
              </span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu(event);
              onToggleAbout(article.id);
            }}
            className={menuItemClass}
          >
            <Icon name="book-open" size="sm" />
            {about ? t`Retirer de la page À propos` : t`Définir comme page À propos`}
          </Button>
          {canReview && article.status === 'SUBMITTED' && (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  closeMenu(event);
                  onReview(article, true);
                }}
                className={cn(menuItemClass, 'text-success-text hover:bg-success/10')}
              >
                <Icon name="circle-check" size="sm" />
                {t`Approuver et publier`}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  closeMenu(event);
                  onReview(article, false);
                }}
                className={cn(menuItemClass, 'text-destructive-text hover:bg-destructive/10')}
              >
                <Icon name="circle-x" size="sm" />
                {t`Rejeter`}
              </Button>
            </>
          )}
          {(article.publisher?.type === 'MEDIA' || article.originPublisher) &&
            !article.isAuthorSovereignCopy && (
              <Button
                variant="ghost"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  closeMenu(event);
                  if (article.sovereignCopyId) {
                    window.location.href = `/articles/${article.sovereignCopyId}`;
                  } else {
                    setRecoverModalOpen(true);
                  }
                }}
                className={menuItemClass}
              >
                <Icon name="git-fork" size="sm" className="text-primary" />
                <span>
                  {article.sovereignCopyId
                    ? t`Ouvrir ma version personnelle`
                    : t`Dupliquer dans mon espace personnel`}
                </span>
              </Button>
            )}
          <Button
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu(event);
              onDelete(article);
            }}
            className={cn(menuItemClass, 'text-destructive-text hover:bg-destructive/10')}
          >
            <Icon name="trash" size="sm" />
            {t`Supprimer`}
          </Button>
        </div>
      </details>

      <RecoverArticleModal
        open={recoverModalOpen}
        onClose={() => setRecoverModalOpen(false)}
        articleId={article.id}
        articleTitle={article.title}
        publisherName={article.publisher?.name}
        currentUserId={article.authorId}
        currentLiveContent={article.content}
      />
    </div>
  );
}
