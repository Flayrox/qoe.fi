'use client';

import React, { useMemo, useState } from 'react';
import {
  GitCompare,
  Columns2,
  Rows3,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Edit3,
  X,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { diffWords, type Change } from 'diff';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@qoe/ui';

export interface ArticleDiffModalProps {
  open: boolean;
  onClose: () => void;
  articleTitle: string;
  draftTitle?: string;
  liveContent: string;
  draftContent: string;
  isPublished: boolean;
  canReview?: boolean;
  canPublish?: boolean;
  status?: string;
  onApprove?: (comment?: string) => Promise<void> | void;
  onReject?: (comment: string) => Promise<void> | void;
  onDiscardDraft?: () => Promise<void> | void;
  onEdit?: () => void;
}

function htmlToReadableText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<blockquote[^>]*>/gi, '> ')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ArticleDiffModal({
  open,
  onClose,
  articleTitle,
  draftTitle,
  liveContent,
  draftContent,
  isPublished,
  canReview,
  status,
  onApprove,
  onReject,
  onDiscardDraft,
  onEdit,
}: ArticleDiffModalProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);

  const cleanLiveText = useMemo(() => htmlToReadableText(liveContent), [liveContent]);
  const cleanDraftText = useMemo(() => htmlToReadableText(draftContent), [draftContent]);

  const diffResult = useMemo(() => {
    return diffWords(cleanLiveText, cleanDraftText);
  }, [cleanLiveText, cleanDraftText]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    diffResult.forEach((part: Change) => {
      if (part.added) additions += part.value.trim().split(/\s+/).filter(Boolean).length;
      if (part.removed) deletions += part.value.trim().split(/\s+/).filter(Boolean).length;
    });
    return { additions, deletions };
  }, [diffResult]);

  const hasTitleChanged = Boolean(draftTitle && draftTitle !== articleTitle);

  const handleApprove = async () => {
    if (!onApprove) return;
    setIsActionPending(true);
    try {
      await onApprove();
      onClose();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setIsActionPending(true);
    try {
      await onReject(rejectComment.trim());
      setRejectMode(false);
      setRejectComment('');
      onClose();
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDiscard = async () => {
    if (!onDiscardDraft) return;
    if (
      !window.confirm(
        t`Êtes-vous sûr de vouloir abandonner les modifications en brouillon ? L'article reviendra à sa version publiée en ligne.`
      )
    ) {
      return;
    }
    setIsActionPending(true);
    try {
      await onDiscardDraft();
      onClose();
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isActionPending && onClose()}>
      <DialogContent className="max-w-5xl h-[88vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border/60">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0 flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GitCompare className="size-4" />
              </span>
              <DialogTitle className="text-base font-semibold">
                {t`Comparaison des versions`}
              </DialogTitle>
              {isPublished && (
                <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                  {t`Version en ligne vs Brouillon`}
                </span>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {stats.additions === 0 && stats.deletions === 0 && !hasTitleChanged
                ? t`Aucune différence textuelle détectée.`
                : t`${stats.additions} ajouts, ${stats.deletions} suppressions par rapport à la version publiée.`}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border/40 bg-muted/20 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'split'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Columns2 className="size-3.5" />
                <span>{t`Côte à côte`}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'unified'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Rows3 className="size-3.5" />
                <span>{t`Vue unifiée`}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isActionPending}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </DialogHeader>

        {/* Title Diff Banner (if title changed) */}
        {hasTitleChanged && (
          <div className="px-6 py-2.5 bg-muted/20 border-b border-border/30 text-xs flex items-center gap-3">
            <span className="font-medium text-muted-foreground shrink-0">{t`Titre :`}</span>
            <span className="text-destructive line-through truncate">{articleTitle}</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-success font-medium truncate">{draftTitle}</span>
          </div>
        )}

        {/* Rejection comment prompt inline */}
        {rejectMode && (
          <div className="p-4 bg-destructive/5 border-b border-destructive/20 space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                <MessageSquare className="size-3.5" />
                {t`Demander des retouches à l'auteur`}
              </span>
              <button
                type="button"
                onClick={() => setRejectMode(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t`Annuler`}
              </button>
            </div>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t`Indiquez à l'auteur les points à réviser (ex: préciser la source, corriger la conclusion)…`}
              rows={2}
              className="w-full text-xs rounded-lg border border-border/60 bg-background p-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectMode(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-border/40 hover:bg-muted/40"
              >
                {t`Retour`}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isActionPending}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 flex items-center gap-1.5"
              >
                {isActionPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                {t`Confirmer la demande de retouches`}
              </button>
            </div>
          </div>
        )}

        {/* Content Viewer */}
        <div className="flex-1 overflow-y-auto p-6 text-sm font-sans leading-relaxed">
          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              {/* Left Column: Live Content */}
              <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4 overflow-y-auto">
                <div className="mb-3 pb-2 border-b border-border/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t`Version publiée (en ligne)`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {stats.deletions > 0 && (
                      <span className="text-destructive font-medium">
                        -{stats.deletions} {t`mots supprimés`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-foreground/80 leading-relaxed font-sans text-[13px]">
                  {diffResult.map((part: Change, index: number) => {
                    if (part.added) return null;
                    if (part.removed) {
                      return (
                        <span
                          key={index}
                          className="bg-destructive/15 text-destructive line-through rounded-xs px-0.5"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={index}>{part.value}</span>;
                  })}
                </div>
              </div>

              {/* Right Column: Proposed Draft Content */}
              <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4 overflow-y-auto">
                <div className="mb-3 pb-2 border-b border-border/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    {t`Brouillon proposé`}
                  </span>
                  <span className="text-[10px]">
                    {stats.additions > 0 && (
                      <span className="text-success font-medium">
                        +{stats.additions} {t`mots ajoutés`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-foreground leading-relaxed font-sans text-[13px]">
                  {diffResult.map((part: Change, index: number) => {
                    if (part.removed) return null;
                    if (part.added) {
                      return (
                        <span
                          key={index}
                          className="bg-success/15 text-success font-medium rounded-xs px-0.5"
                        >
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={index}>{part.value}</span>;
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Unified Mode */
            <div className="rounded-xl border border-border/40 bg-card p-5 max-w-3xl mx-auto overflow-y-auto">
              <div className="whitespace-pre-wrap text-foreground leading-relaxed font-sans text-[13px]">
                {diffResult.map((part: Change, index: number) => {
                  if (part.added) {
                    return (
                      <span
                        key={index}
                        className="bg-success/15 text-success font-medium rounded-xs px-0.5"
                      >
                        {part.value}
                      </span>
                    );
                  }
                  if (part.removed) {
                    return (
                      <span
                        key={index}
                        className="bg-destructive/15 text-destructive line-through rounded-xs px-0.5"
                      >
                        {part.value}
                      </span>
                    );
                  }
                  return <span key={index}>{part.value}</span>;
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-border/40 shrink-0 bg-muted/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onDiscardDraft && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isActionPending}
                className="h-8 px-2.5 rounded-lg border border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/30 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title={t`Abandonner le brouillon et réinitialiser à la version en ligne`}
              >
                <RotateCcw className="size-3.5" />
                <span>{t`Abandonner le brouillon`}</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit();
                }}
                className="h-8 px-2.5 rounded-lg border border-border/40 bg-card text-foreground hover:bg-muted/40 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="size-3.5" />
                <span>{t`Modifier dans l'éditeur`}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canReview && status === 'SUBMITTED' && onReject && !rejectMode && (
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                disabled={isActionPending}
                className="h-8 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle className="size-3.5" />
                <span>{t`Demander des retouches`}</span>
              </button>
            )}

            {canReview && onApprove && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={isActionPending}
                className="h-8 px-3.5 rounded-lg bg-success hover:bg-success/90 text-success-foreground text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isActionPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                <span>{t`Approuver et publier`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              disabled={isActionPending}
              className="h-8 px-3 rounded-lg border border-border/40 hover:bg-muted/40 text-xs font-medium transition-colors"
            >
              {t`Fermer`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
