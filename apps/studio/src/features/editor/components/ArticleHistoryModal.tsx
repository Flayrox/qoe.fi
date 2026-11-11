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
  XCircle,
  User,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { Button } from '@qoe/ui/button';
import { Badge } from '@qoe/ui/badge';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { toast } from '@qoe/ui/toast';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { t } from '@lingui/core/macro';
import {
  getArticleEventsAction,
  getArticleSnapshotsAction,
  restoreArticleSnapshotAction,
  type ArticleEvent,
  type ArticleEventType,
  type ArticleSnapshotDTO,
} from '@qoe/sdk/actions/articles';

export interface ArticleHistoryModalProps {
  open: boolean;
  articleId: string | null;
  canEdit?: boolean;
  onClose: () => void;
  onRestored?: () => void;
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
      label: t`Publisher programmée`,
      description: t`L'article sera publié automatiquement à la date choisie.`,
      icon: <CalendarClock className="h-3.5 w-3.5" />,
      tone: 'neutral',
    },
    RESCHEDULED: {
      label: t`Publisher reportée`,
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
  positive: 'bg-success/10 text-success-text border-success/25',
  neutral: 'bg-muted/60 text-muted-foreground border-border/60',
  warning: 'bg-highlight/10 text-highlight border-highlight/30',
  negative: 'bg-destructive/10 text-destructive-text border-destructive/25',
};

function snapshotReasonLabel(reason: string): string {
  switch (reason) {
    case 'INITIAL':
      return t`Création initiale`;
    case 'AUTHOR_SWITCH':
      return t`Changement de rédacteur`;
    case 'SUBMITTED':
      return t`Soumis à relecture`;
    case 'PUBLISHED':
      return t`Publié`;
    case 'BEFORE_REVOCATION':
      return t`Avant révocation`;
    case 'BEFORE_RESTORE':
      return t`Avant restauration`;
    default:
      return reason;
  }
}

/**
 * Historique des versions et chronologie des événements de publication.
 */
export function ArticleHistoryModal({
  open,
  articleId,
  canEdit = true,
  onClose,
  onRestored,
}: ArticleHistoryModalProps) {
  const [activeTab, setActiveTab] = React.useState<'snapshots' | 'events'>('snapshots');
  const [events, setEvents] = React.useState<ArticleEvent[] | null>(null);
  const [snapshots, setSnapshots] = React.useState<ArticleSnapshotDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !articleId) return;
    let cancelled = false;
    setEvents(null);
    setSnapshots(null);
    setError(null);

    void Promise.all([
      getArticleEventsAction(articleId),
      getArticleSnapshotsAction({ articleId }),
    ]).then(([eventsRes, snapshotsRes]) => {
      if (cancelled) return;
      if (eventsRes.ok) setEvents(eventsRes.data);
      if (snapshotsRes.ok) setSnapshots(snapshotsRes.data);
      if (!eventsRes.ok && !snapshotsRes.ok) {
        setError(eventsRes.error?.message || t`Impossible de charger l'historique.`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, articleId]);

  const handleRestore = async (snapshotId: string) => {
    if (!articleId) return;
    setRestoringId(snapshotId);
    const res = await restoreArticleSnapshotAction({ articleId, snapshotId });
    setRestoringId(null);
    if (res.ok) {
      toast.success(t`Version restaurée avec succès.`);
      onRestored?.();
      onClose();
    } else {
      toast.error(res.error?.message || t`Échec de la restauration`);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      size="lg"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent overlayClassName="z-[100] items-start pt-[8vh]">
        <DialogHeader className="border-b border-border/50 pb-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <div>
              <DialogTitle className="text-sm font-semibold">{t`Historique de l'écrit`}</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                {t`Versions du texte enregistrées et jalons éditoriaux.`}
              </DialogDescription>
            </div>
          </div>

          <div className="mt-3">
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(val) => setActiveTab(val as 'snapshots' | 'events')}
            >
              <TabList>
                <Tab id="snapshots" className="text-xs">
                  {t`Versions du texte`}
                </Tab>
                <Tab id="events" className="text-xs">
                  {t`Journal d'activité`}
                </Tab>
              </TabList>
            </Tabs>
          </div>
        </DialogHeader>

        <DialogBody className="max-h-[55vh] py-2">
          {!articleId && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t`L'historique apparaîtra une fois l'article enregistré une première fois.`}
            </p>
          )}

          {articleId && events === null && snapshots === null && !error && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t`Chargement…`}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive-text">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {activeTab === 'snapshots' && snapshots && snapshots.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t`Aucune version textuelle enregistrée pour l'instant.`}
            </p>
          )}

          {activeTab === 'snapshots' && snapshots && snapshots.length > 0 && (
            <div className="space-y-3 py-1">
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {snap.title || t`Sans titre`}
                      </span>
                      <Badge variant="outline" size="sm" className="text-[10px]">
                        {snapshotReasonLabel(snap.reason)}
                      </Badge>
                      {idx === 0 && (
                        <Badge variant="soft" size="sm" className="text-[9px]">
                          {t`Plus récent`}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        {snap.wordCount} {t`mots`}
                      </span>
                      <span>·</span>
                      <time dateTime={snap.createdAt}>{formatDateTime(snap.createdAt)}</time>
                      {snap.actorName && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {snap.actorName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={restoringId !== null}
                      onClick={() => handleRestore(snap.id)}
                      className="shrink-0 text-xs"
                    >
                      {restoringId === snap.id ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {t`Restauration…`}
                        </>
                      ) : (
                        <>
                          <RotateCcw className="mr-1 h-3 w-3" />
                          {t`Restaurer`}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'events' && events && events.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {t`Aucun événement pour l'instant.`}
            </p>
          )}

          {activeTab === 'events' && events && events.length > 0 && (
            <ol className="relative space-y-5 border-l border-border/60 pl-5 ml-3">
              {events.map((event) => {
                const visual = visualFor(event);
                return (
                  <li key={event.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[32px] top-0 grid size-6 place-items-center rounded-full border',
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
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
