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
      <span className="text-xs text-muted-foreground font-sans flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        {t`Enregistrement…`}
      </span>
    );
  }
  if (autoSaveStatus === 'error') {
    return (
      <span className="text-[11px] font-normal text-destructive bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded-md flex items-center gap-1.5 font-sans max-w-[320px]">
        <AlertCircle className="w-3 h-3 text-destructive shrink-0" />
        <span className="truncate">
          {t`Échec de l'enregistrement`}
          {autoSaveError ? ` — ${autoSaveError}` : ''}
        </span>
        <button
          type="button"
          onClick={onRetryAutoSave}
          className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold text-destructive hover:underline cursor-pointer shrink-0"
          title={t`Réessayer la sauvegarde`}
        >
          <RotateCcw className="w-2.5 h-2.5" /> {t`Réessayer`}
        </button>
      </span>
    );
  }
  if (autoSaveStatus === 'saved') {
    return (
      <span className="text-[11px] font-normal text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-md flex items-center gap-1.5 font-sans">
        <Check className="w-3 h-3 text-success" /> {t`Brouillon auto-enregistré`}
        {lastSaved ? ` à ${lastSaved.toLocaleTimeString()}` : ''}
      </span>
    );
  }
  if (hasUnsavedChanges) {
    return (
      <span className="text-[10px] font-medium text-highlight bg-highlight/10 border border-highlight/20 px-2 py-0.5 rounded-md font-sans whitespace-nowrap">
        {t`Modifications en cours… (⌘S)`}
      </span>
    );
  }
  if (lastSaved) {
    return (
      <span className="text-[11px] font-normal text-muted-foreground flex items-center gap-1.5 font-sans whitespace-nowrap">
        <Check className="w-3.5 h-3.5 text-muted-foreground" /> {t`Sauvegardé à`}{' '}
        {lastSaved.toLocaleTimeString()}
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
    <div className="flex flex-col gap-4 pb-5 border-b border-border/40 @container">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t`Retour`}
              className="mt-0.5 h-8 w-8 shrink-0 rounded-full flex items-center justify-center border border-border/40 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-foreground font-sans tracking-tight flex items-center gap-2 flex-wrap">
              {isNew ? t`Nouvel écrit` : t`Édition`}
              {showCollaboration && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium',
                    collaborationConnected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                  data-testid="collaboration-status"
                >
                  <UsersRound className="h-3 w-3" />
                  {collaborationConnected
                    ? collaborationPeerCount > 0
                      ? t`${collaborationPeerCount + 1} éditeurs en direct`
                      : t`Co-édition en direct`
                    : t`Co-édition · reconnexion…`}
                </span>
              )}
              <SaveState {...props} />
            </h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-sans">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
                  published
                    ? 'border-success/25 bg-success/10 text-success'
                    : status === 'SCHEDULED' || scheduledAt
                      ? 'border-highlight/25 bg-highlight/10 text-highlight'
                      : status === 'SUBMITTED'
                        ? 'border-highlight/25 bg-highlight/10 text-highlight'
                        : 'border-border/40 bg-muted/30 text-muted-foreground'
                )}
              >
                {published ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : status === 'SUBMITTED' ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <CalendarClock className="h-3 w-3" />
                )}
                {published
                  ? t`En ligne`
                  : status === 'SUBMITTED'
                    ? t`En revue`
                    : status === 'SCHEDULED' || scheduledAt
                      ? t`Programmé`
                      : t`Brouillon privé`}
              </span>
              <span className="hidden sm:inline">{t`Rédigez sans bruit ni distraction`}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button
            type="button"
            onClick={onOpenAnalytics}
            aria-label={t`Analyses`}
            title={t`Inspecter les statistiques réelles de cet article`}
            className="h-8 w-8 rounded-lg flex items-center justify-center border border-border/40 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all cursor-pointer"
          >
            <BarChart3 className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>

          <button
            type="button"
            onClick={onOpenSchedule}
            aria-label={t`Programmer`}
            title={
              scheduledAt
                ? t`Programmation active — modifier`
                : t`Programmer la publication à une date ultérieure`
            }
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer',
              scheduledAt
                ? 'border-highlight/30 bg-highlight/10 text-highlight'
                : 'border-border/40 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePremium}
            aria-label={isPremium ? t`Article Premium` : t`Article gratuit`}
            title={isPremium ? t`Article Premium` : t`Article gratuit`}
            className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer',
              isPremium
                ? 'bg-highlight/10 border-highlight/30 text-highlight'
                : 'bg-card border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {isPremium ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={onToggleSettings}
            aria-label={t`Options`}
            title={t`Options de l'article`}
            className={cn(
              'h-8 px-2.5 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium transition-all cursor-pointer border border-border/40',
              settingsOpen
                ? 'bg-muted text-foreground font-semibold'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Settings className="h-3.5 w-3.5 stroke-[1.5]" />
            <span className="hidden md:inline">{t`Options`}</span>
          </button>

          {previewHref && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t`Aperçu`}
              title={t`Ouvrir la page publique ou la prévisualisation de l'écrit`}
              className="h-8 w-8 rounded-lg flex items-center justify-center bg-muted/50 text-foreground hover:bg-muted border border-border/40 transition-all cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
            </a>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={props.isSaving}
            className="h-8 px-3 bg-primary text-primary-foreground font-sans text-xs font-bold rounded-lg flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-sm"
          >
            {t`Enregistrer`}
          </button>

          {published &&
            (props.hasUnpublishedChanges || props.hasUnsavedChanges) &&
            props.onOpenDiff && (
              <button
                type="button"
                onClick={props.onOpenDiff}
                className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 font-sans text-xs font-medium border border-border/40 bg-card text-highlight hover:bg-highlight/10 transition-all cursor-pointer"
                title={t`Comparer le brouillon actuel avec la version publiée en ligne`}
              >
                <GitCompare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t`Diff`}</span>
              </button>
            )}

          {isSubmitter ? (
            status !== 'SUBMITTED' && (
              <button
                type="button"
                onClick={onSubmitReview}
                className="h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-semibold transition-all cursor-pointer bg-highlight text-highlight-foreground hover:opacity-90 border border-transparent shadow-xs"
                title={t`Soumettre cet article à l'approbation de votre équipe`}
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">
                  {published ? t`Soumettre les modifications` : t`Soumettre`}
                </span>
              </button>
            )
          ) : published ? (
            <button
              type="button"
              onClick={onUpdateLive}
              disabled={props.isSaving}
              className={cn(
                'h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-semibold transition-all cursor-pointer shadow-xs',
                props.hasUnsavedChanges
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-muted text-muted-foreground hover:text-foreground border border-border/60'
              )}
              title={t`Mettre à jour la version publique en ligne avec vos dernières modifications`}
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {props.hasUnsavedChanges ? t`Mettre à jour` : t`Publier modifications`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onPublish}
              className="h-8 px-3 rounded-lg flex items-center gap-1.5 font-sans text-xs font-semibold transition-all cursor-pointer bg-primary text-primary-foreground hover:opacity-90 shadow-xs"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t`Publier`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
