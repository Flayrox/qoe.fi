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
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { diffWords, type Change } from 'diff';
import { t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Textarea } from '@qoe/ui/input';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';

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
    <Dialog
      open={open}
      isDismissable={!isActionPending}
      onOpenChange={(v) => !v && !isActionPending && onClose()}
    >
      <DialogContent className="sm:max-w-5xl h-[88vh] p-0 sm:p-0 gap-0 overflow-hidden bg-background border-border/60">
        {/* Header */}
        <DialogHeader className="px-6 py-4 pr-14 border-b border-border/40 shrink-0 flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GitCompare className="size-4" />
              </span>
              <DialogTitle>{t`Comparaison des versions`}</DialogTitle>
              {isPublished && (
                <Badge variant="soft" tone="success" shape="pill">
                  {t`Version en ligne vs Brouillon`}
                </Badge>
              )}
            </div>
            <DialogDescription>
              {stats.additions === 0 && stats.deletions === 0 && !hasTitleChanged
                ? t`Aucune différence textuelle détectée.`
                : t`${stats.additions} ajouts, ${stats.deletions} suppressions par rapport à la version publiée.`}
            </DialogDescription>
          </div>

          <Tabs
            variant="segmented"
            size="xs"
            value={viewMode}
            onValueChange={(val) => setViewMode(val as 'split' | 'unified')}
          >
            <TabList aria-label={t`Mode d'affichage du diff`}>
              <Tab id="split">
                <span className="inline-flex items-center gap-1.5">
                  <Columns2 className="size-3.5" />
                  <span>{t`Côte à côte`}</span>
                </span>
              </Tab>
              <Tab id="unified">
                <span className="inline-flex items-center gap-1.5">
                  <Rows3 className="size-3.5" />
                  <span>{t`Vue unifiée`}</span>
                </span>
              </Tab>
            </TabList>
          </Tabs>
        </DialogHeader>

        {/* Title Diff Banner (if title changed) */}
        {hasTitleChanged && (
          <div className="px-6 py-2.5 bg-muted/20 border-b border-border/30 text-xs flex items-center gap-3">
            <span className="font-medium text-muted-foreground shrink-0">{t`Titre :`}</span>
            <span className="text-destructive-text line-through truncate">{articleTitle}</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-success-text font-medium truncate">{draftTitle}</span>
          </div>
        )}

        {/* Rejection comment prompt inline */}
        {rejectMode && (
          <div className="p-4 bg-destructive/5 border-b border-destructive/20 space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-destructive-text flex items-center gap-1.5">
                <MessageSquare className="size-3.5" />
                {t`Demander des retouches à l'auteur`}
              </span>
              <Button variant="ghost" size="xs" onClick={() => setRejectMode(false)}>
                {t`Annuler`}
              </Button>
            </div>
            <Textarea
              size="sm"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t`Indiquez à l'auteur les points à réviser (ex: préciser la source, corriger la conclusion)…`}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="xs" onClick={() => setRejectMode(false)}>
                {t`Retour`}
              </Button>
              <Button
                variant="solid"
                tone="danger"
                size="xs"
                onClick={handleReject}
                disabled={isActionPending}
              >
                {isActionPending ? <Loader2 className="animate-spin" /> : <XCircle />}
                {t`Confirmer la demande de retouches`}
              </Button>
            </div>
          </div>
        )}

        {/* Content Viewer */}
        <DialogBody className="flex-1 p-6 text-sm font-sans leading-relaxed">
          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Left Column: Live Content */}
              <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4">
                <div className="mb-3 pb-2 border-b border-border/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t`Version publiée (en ligne)`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {stats.deletions > 0 && (
                      <span className="text-destructive-text font-medium">
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
                          className="bg-destructive/15 text-destructive-text line-through rounded-xs px-0.5"
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
              <div className="flex flex-col rounded-xl border border-border/40 bg-card p-4">
                <div className="mb-3 pb-2 border-b border-border/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                    {t`Brouillon proposé`}
                  </span>
                  <span className="text-[10px]">
                    {stats.additions > 0 && (
                      <span className="text-success-text font-medium">
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
                          className="bg-success/15 text-success-text font-medium rounded-xs px-0.5"
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
            <div className="mx-auto max-w-3xl rounded-xl border border-border/40 bg-card p-5">
              <div className="whitespace-pre-wrap text-foreground leading-relaxed font-sans text-[13px]">
                {diffResult.map((part: Change, index: number) => {
                  if (part.added) {
                    return (
                      <span
                        key={index}
                        className="bg-success/15 text-success-text font-medium rounded-xs px-0.5"
                      >
                        {part.value}
                      </span>
                    );
                  }
                  if (part.removed) {
                    return (
                      <span
                        key={index}
                        className="bg-destructive/15 text-destructive-text line-through rounded-xs px-0.5"
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
        </DialogBody>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-3.5 border-t border-border/40 shrink-0 bg-muted/10 flex-wrap justify-between gap-3">
          <div className="flex items-center gap-2">
            {onDiscardDraft && (
              <Button
                variant="outline"
                tone="danger"
                size="sm"
                onClick={handleDiscard}
                disabled={isActionPending}
                title={t`Abandonner le brouillon et réinitialiser à la version en ligne`}
              >
                <RotateCcw />
                <span>{t`Abandonner le brouillon`}</span>
              </Button>
            )}

            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit();
                }}
              >
                <Edit3 />
                <span>{t`Modifier dans l'éditeur`}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canReview && status === 'SUBMITTED' && onReject && !rejectMode && (
              <Button
                variant="outline"
                tone="danger"
                size="sm"
                onClick={() => setRejectMode(true)}
                disabled={isActionPending}
              >
                <XCircle />
                <span>{t`Demander des retouches`}</span>
              </Button>
            )}

            {canReview && onApprove && (
              <Button
                variant="solid"
                tone="success"
                size="sm"
                onClick={handleApprove}
                disabled={isActionPending}
              >
                {isActionPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                <span>{t`Approuver et publier`}</span>
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={onClose} disabled={isActionPending}>
              {t`Fermer`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
