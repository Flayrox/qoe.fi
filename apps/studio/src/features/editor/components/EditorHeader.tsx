'use client';

import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitCompare,
  History,
  Loader2,
  Lock,
  RotateCcw,
  Send,
  Settings,
  Unlock,
  UsersRound,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button, buttonClasses } from '@qoe/ui/button';
import type { EditorCapabilities } from '@qoe/sdk/actions/articles';
import type { AutoSaveStatus } from '@qoe/sdk';

export interface EditorHeaderProps {
  isNew: boolean;
  isPremium: boolean;
  published: boolean;
  status: string;
  scheduledAt: string | null;
  previewHref?: string;
  capabilities?: EditorCapabilities;
  collaborationConnected: boolean;
  collaborationPeerCount: number;
  showCollaboration: boolean;
  isSaving: boolean;
  autoSaveStatus: AutoSaveStatus;
  autoSaveError: string | null;
  hasUnsavedChanges: boolean;
  hasUnpublishedChanges?: boolean;
  lastSaved: Date | null;
  settingsOpen: boolean;
  onBack?: () => void;
  onOpenAnalytics: () => void;
  onOpenHistory?: () => void;
  onToggleSettings: () => void;
  onOpenSchedule: () => void;
  onTogglePremium: () => void;
  onPublish: () => void;
  onUpdateLive: () => void;
  onSubmitReview: () => void;
  onOpenDiff?: () => void;
  onSave: () => void;
  onRetryAutoSave: () => void;
}

/** « 25 oct. 09:00 » — date de programmation lisible dans le badge d'état. */
function formatScheduleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SaveState({
  isSaving,
  autoSaveStatus,
  autoSaveError,
  hasUnsavedChanges,
  lastSaved,
  onRetryAutoSave,
}: Pick<
  EditorHeaderProps,
  | 'isSaving'
  | 'autoSaveStatus'
  | 'autoSaveError'
  | 'hasUnsavedChanges'
  | 'lastSaved'
  | 'onRetryAutoSave'
>) {
  if (isSaving || autoSaveStatus === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t`Enregistrement…`}
      </span>
    );
  }
  if (autoSaveStatus === 'error') {
    return (
      <span className="flex max-w-[320px] items-center gap-1.5 text-[11px] text-destructive-text">
        <AlertCircle className="size-3 shrink-0" />
        <span className="truncate">
          {t`Échec de l'enregistrement`}
          {autoSaveError ? ` — ${autoSaveError}` : ''}
        </span>
        <Button variant="ghost" tone="danger" size="xs" onClick={onRetryAutoSave}>
          <RotateCcw />
          {t`Réessayer`}
        </Button>
      </span>
    );
  }
  if (autoSaveStatus === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Check className="size-3 text-success-text" />
        {t`Brouillon enregistré`}
        {lastSaved ? ` à ${lastSaved.toLocaleTimeString()}` : ''}
      </span>
    );
  }
  if (hasUnsavedChanges) {
    return (
      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
        {t`Modifications en cours… (⌘S)`}
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
        <Check className="size-3.5" />
        {t`Sauvegardé à`} {lastSaved.toLocaleTimeString()}
      </span>
    );
  }
  return null;
}

export function EditorHeader(props: EditorHeaderProps) {
  const {
    isNew,
    isPremium,
    published,
    status,
    scheduledAt,
    previewHref,
    capabilities,
    collaborationConnected,
    collaborationPeerCount,
    showCollaboration,
    settingsOpen,
    onBack,
    onOpenAnalytics,
    onOpenHistory,
    onToggleSettings,
    onOpenSchedule,
    onTogglePremium,
    onPublish,
    onUpdateLive,
    onSubmitReview,
    onSave,
  } = props;

  const isSubmitter = Boolean(capabilities?.isMedia && !capabilities?.canPublish);

  return (
    <div className="@container flex flex-col gap-3 border-b border-border/40 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              shape="icon"
              onClick={onBack}
              aria-label={t`Retour`}
              title={t`Retour aux articles`}
              className="-ml-1.5"
            >
              <ArrowLeft />
            </Button>
          ) : null}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {isNew ? t`Nouvel écrit` : t`Édition`}
              </h1>
              {showCollaboration ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium',
                    collaborationConnected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                  data-testid="collaboration-status"
                >
                  <UsersRound className="size-3" />
                  {collaborationConnected
                    ? collaborationPeerCount > 0
                      ? t`${collaborationPeerCount + 1} éditeurs`
                      : t`Co-édition`
                    : t`Reconnexion…`}
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5',
                  published
                    ? 'bg-success/10 text-success-text'
                    : status === 'SCHEDULED' || scheduledAt || status === 'SUBMITTED'
                      ? 'bg-highlight/10 text-highlight'
                      : 'bg-muted/60 text-muted-foreground'
                )}
              >
                {published ? (
                  <CheckCircle2 className="size-3" />
                ) : status === 'SUBMITTED' ? (
                  <Clock className="size-3" />
                ) : (
                  <CalendarClock className="size-3" />
                )}
                {published
                  ? t`En ligne`
                  : status === 'SUBMITTED'
                    ? t`En revue`
                    : status === 'SCHEDULED' || scheduledAt
                      ? scheduledAt
                        ? t`Programmé · ${formatScheduleDate(scheduledAt)}`
                        : t`Programmé`
                      : t`Brouillon`}
              </span>
              <SaveState {...props} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            variant="outline"
            size="sm"
            shape="icon"
            onClick={onOpenAnalytics}
            aria-label={t`Analyses`}
            title={t`Statistiques de cet article`}
          >
            <BarChart3 />
          </Button>

          {onOpenHistory ? (
            <Button
              variant="outline"
              size="sm"
              shape="icon"
              onClick={onOpenHistory}
              aria-label={t`Historique de publication`}
              title={t`Historique de publication`}
            >
              <History />
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            shape="icon"
            onClick={onOpenSchedule}
            aria-label={t`Programmer`}
            title={scheduledAt ? t`Programmation active — modifier` : t`Programmer la publication`}
            className={scheduledAt ? 'bg-highlight/10 text-highlight' : undefined}
          >
            <CalendarClock />
          </Button>

          <Button
            variant="outline"
            size="sm"
            shape="icon"
            onClick={onTogglePremium}
            aria-label={isPremium ? t`Article Premium` : t`Article gratuit`}
            title={isPremium ? t`Article Premium` : t`Article gratuit`}
            className={isPremium ? 'bg-highlight/10 text-highlight' : undefined}
          >
            {isPremium ? <Lock /> : <Unlock />}
          </Button>

          <Button
            variant={settingsOpen ? 'soft' : 'outline'}
            tone={settingsOpen ? 'brand' : 'neutral'}
            size="sm"
            onClick={onToggleSettings}
          >
            <Settings />
            <span className="hidden md:inline">{t`Options`}</span>
          </Button>

          {previewHref ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t`Aperçu`}
              title={t`Ouvrir la page publique`}
              className={buttonClasses({ variant: 'outline', size: 'sm', shape: 'icon' })}
            >
              <ExternalLink />
            </a>
          ) : null}

          <Button variant="solid" tone="brand" size="sm" onClick={onSave} disabled={props.isSaving}>
            {t`Enregistrer`}
          </Button>

          {published &&
          (props.hasUnpublishedChanges || props.hasUnsavedChanges) &&
          props.onOpenDiff ? (
            <Button
              variant="outline"
              size="sm"
              onClick={props.onOpenDiff}
              title={t`Comparer avec la version publiée`}
            >
              <GitCompare />
              <span className="hidden sm:inline">{t`Comparer`}</span>
            </Button>
          ) : null}

          {isSubmitter ? (
            status !== 'SUBMITTED' ? (
              <Button variant="solid" tone="brand" size="sm" onClick={onSubmitReview}>
                <Send />
                <span className="hidden sm:inline">
                  {published ? t`Soumettre les modifications` : t`Soumettre`}
                </span>
              </Button>
            ) : null
          ) : published ? (
            <Button
              variant={props.hasUnsavedChanges ? 'solid' : 'soft'}
              tone="brand"
              size="sm"
              onClick={onUpdateLive}
              disabled={props.isSaving}
            >
              <Send />
              <span className="hidden sm:inline">
                {props.hasUnsavedChanges ? t`Mettre à jour` : t`Version en ligne`}
              </span>
            </Button>
          ) : (
            <Button variant="solid" tone="brand" size="sm" onClick={onPublish}>
              <Send />
              <span className="hidden sm:inline">{t`Publier`}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
