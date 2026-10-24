'use client';

import React from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Clock,
  FilePlus2,
  History,
  Loader2,
  RotateCcw,
  Send,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import {
  getArticleEventsAction,
  type ArticleEvent,
  type ArticleEventType,
} from '@qoe/sdk/actions/articles';

export interface ArticleHistoryModalProps {
  open: boolean;
  articleId: string | null;
  onClose: () => void;
}

interface EventVisual {
  label: string;
  description: string;
  icon: React.ReactNode;
  tone: 'positive' | 'neutral' | 'warning' | 'negative';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function visualFor(event: ArticleEvent): EventVisual {
  const map: Record<ArticleEventType, EventVisual> = {
    CREATED: {
      label: t`Écrit créé`,
      description: t`Premier brouillon de cet article.`,
      icon: <FilePlus2 className="h-3.5 w-3.5" />,
      tone: 'neutral',
    },
    PUBLISHED: {
      label: t`Publié`,
      description: t`L'article est devenu visible publiquement.`,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: 'positive',
    },
    LIVE_UPDATED: {
      label: t`Version en ligne mise à jour`,
      description: t`Le brouillon a remplacé la version publique.`,
      icon: <ArrowUpRight className="h-3.5 w-3.5" />,
      tone: 'positive',
    },
    UNPUBLISHED: {
      label: t`Dépublié`,
      description: t`L'article n'est plus accessible publiquement.`,
      icon: <Undo2 className="h-3.5 w-3.5" />,
      tone: 'warning',
    },
    SCHEDULED: {
      label: t`Publication programmée`,
      description: t`L'article sera publié automatiquement à la date choisie.`,
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      tone: 'neutral',
    },
    RESCHEDULED: {
      label: t`Publication reportée`,
      description: t`La date de publication programmée a changé.`,
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      tone: 'neutral',
    },
    SCHEDULE_CANCELLED: {
      label: t`Programmation annulée`,
      description: t`L'article redevient un brouillon simple.`,
      icon: <CalendarOff className="h-3.5 w-3.5" />,
      tone: 'warning',
    },
    SCHEDULED_PUBLISHED: {
      label: t`Publié automatiquement`,
      description: t`Le planificateur a publié l'article à l'heure prévue.`,
      icon: <Clock className="h-3.5 w-3.5" />,
      tone: 'positive',
    },
    SUBMITTED: {
      label: t`Soumis à relecture`,
      description: t`En attente de validation par le comité éditorial.`,
      icon: <Send className="h-3.5 w-3.5" />,
      tone: 'neutral',
    },
    APPROVED: {
      label: t`Approuvé`,
      description: t`Le comité éditorial a validé l'article.`,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: 'positive',
    },
    REJECTED: {
      label: t`Retouches demandées`,
      description: t`Le comité éditorial a demandé des modifications.`,
      icon: <XCircle className="h-3.5 w-3.5" />,
      tone: 'negative',
    },
  };
  return (
    map[event.type] ?? {
      label: event.type,
      description: '',
      icon: <History className="h-3.5 w-3.5" />,
      tone: 'neutral',
    }
  );
}

const TONE_CLASSES: Record<EventVisual['tone'], string> = {
  positive: 'bg-success/10 text-success border-success/25',
  neutral: 'bg-muted/60 text-muted-foreground border-border/60',
  warning: 'bg-highlight/10 text-highlight border-highlight/30',
  negative: 'bg-destructive/10 text-destructive border-destructive/25',
};

/**
 * Chronologie de publication. Volontairement en lecture seule : l'historique
 * est un journal append-only, rien ici ne se modifie ni ne s'efface.
 */
export function ArticleHistoryModal({ open, articleId, onClose }: ArticleHistoryModalProps) {
  const [events, setEvents] = React.useState<ArticleEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !articleId) return;
    let cancelled = false;
    setEvents(null);
    setError(null);
    void getArticleEventsAction(articleId).then((res) => {
      if (cancelled) return;
      if (res.ok) setEvents(res.data);
      else setError(res.error?.message || t`Impossible de charger l'historique.`);
    });
    return () => {
      cancelled = true;
    };
  }, [open, articleId]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-history-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-popover shadow-[0_24px_60px_-12px_rgba(0,0,0,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/50 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="article-history-title" className="text-sm font-semibold tracking-tight">
                {t`Historique de publication`}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t`Chaque étape de la vie publique de cet écrit.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Fermer`}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {!articleId && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t`L'historique apparaîtra une fois l'article enregistré une première fois.`}
            </p>
          )}

          {articleId && events === null && !error && (
            <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t`Chargement…`}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {events && events.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t`Aucun événement pour l'instant. La chronologie se remplit dès la première publication.`}
            </p>
          )}

          {events && events.length > 0 && (
            <ol className="relative space-y-5 border-l border-border/60 pl-5">
              {events.map((event) => {
                const visual = visualFor(event);
                return (
                  <li key={event.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[30px] top-0 grid size-6 place-items-center rounded-full border',
                        TONE_CLASSES[visual.tone]
                      )}
                      aria-hidden="true"
                    >
                      {visual.icon}
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <h3 className="text-xs font-semibold text-foreground">{visual.label}</h3>
                      <time
                        dateTime={event.createdAt}
                        className="text-[11px] tabular-nums text-muted-foreground"
                      >
                        {formatDateTime(event.createdAt)}
                      </time>
                    </div>
                    {visual.description && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {visual.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                      {event.fromStatus &&
                        event.toStatus &&
                        event.fromStatus !== event.toStatus && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide">
                            {event.fromStatus} → {event.toStatus}
                          </span>
                        )}
                      {event.scheduledAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {formatDateTime(event.scheduledAt)}
                        </span>
                      )}
                      {event.actorName && (
                        <span>
                          {t`par`}{' '}
                          {event.actorUsername ? (
                            <span className="text-foreground/80">@{event.actorUsername}</span>
                          ) : (
                            event.actorName
                          )}
                        </span>
                      )}
                      {!event.actorName && !event.actorId && <span>{t`automatique`}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
