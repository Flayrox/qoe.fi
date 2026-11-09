'use client';

import React, { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { Highlighter, Check, X, CheckCheck, Ban } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Badge } from '@qoe/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { markSkin } from '@qoe/ui/mark-skin';

export interface DetectedBracketAnnotation {
  /** Position de début du motif complet `{Texte}(Note)` dans le document ProseMirror. */
  from: number;
  /** Position de fin du motif complet `{Texte}(Note)` dans le document ProseMirror. */
  to: number;
  /** Texte cible entre accolades `{...}`. */
  targetText: string;
  /** Contenu de l'annotation entre parenthèses `(...)`. */
  noteText: string;
  /** Extrait de phrase avant le motif pour situer le passage. */
  contextBefore: string;
  /** Extrait de phrase après le motif pour situer le passage. */
  contextAfter: string;
}

export interface PastedAnnotationsDialogProps {
  open: boolean;
  current: DetectedBracketAnnotation | null;
  currentIndex: number;
  totalCount: number;
  remainingCount: number;
  onConfirmCurrent: (note: string) => void;
  onSkipCurrent: () => void;
  onConfirmAll: (currentNote: string) => void;
  onSkipAll: () => void;
}

export const PastedAnnotationsDialog = ({
  open,
  current,
  currentIndex,
  totalCount,
  remainingCount,
  onConfirmCurrent,
  onSkipCurrent,
  onConfirmAll,
  onSkipAll,
}: PastedAnnotationsDialogProps) => {
  const [noteDraft, setNoteDraft] = useState(current?.noteText ?? '');

  useEffect(() => {
    setNoteDraft(current?.noteText ?? '');
  }, [current]);

  if (!open || !current) return null;

  const effectiveNote = noteDraft.trim() || current.noteText;

  return (
    <Dialog
      open={open}
      size="lg"
      isDismissable={true}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onSkipAll();
      }}
    >
      <DialogContent
        aria-label={t`Annotations détectées dans le texte collé`}
        className="gap-0 overflow-hidden bg-background p-0 sm:p-0 text-foreground"
      >
        <DialogHeader className="border-b border-border/60 p-5 pr-12">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Highlighter className="size-3.5" />
            </div>
            <Badge variant="soft" tone="brand" size="xs">
              {t`Annotation ${currentIndex} sur ${totalCount}`}
            </Badge>
          </div>
          <DialogTitle className="text-base font-bold tracking-tight">
            {t`Voulez-vous transformer ce passage en annotation officielle ?`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t`Une syntaxe d'annotation {Texte}(Note) a été détectée dans le contenu collé.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="p-5 space-y-4">
          {/* Contexte dans la phrase */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
              {t`Aperçu dans le texte`}
            </span>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 text-sm leading-relaxed text-foreground/90 font-sans">
              {current.contextBefore && (
                <span className="text-muted-foreground">{current.contextBefore}</span>
              )}
              <mark className={markSkin('official')}>{current.targetText}</mark>
              {current.contextAfter && (
                <span className="text-muted-foreground">{current.contextAfter}</span>
              )}
            </div>
          </div>

          {/* Passage surligné */}
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-border/50 bg-card/60 px-3.5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                {t`Passage annoté`}
              </span>
              <p className="text-xs font-medium text-foreground">« {current.targetText} »</p>
            </div>

            {/* Note associée (modifiable avant validation) */}
            <div>
              <label
                htmlFor="pasted-annotation-note"
                className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5"
              >
                {t`Contenu de l'annotation officielle`}
              </label>
              <textarea
                id="pasted-annotation-note"
                rows={2}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    onConfirmCurrent(effectiveNote);
                  }
                }}
                className="w-full resize-none rounded-xl border border-border/60 bg-background p-2.5 font-sans text-xs leading-relaxed text-foreground transition-all placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/30 focus:outline-none"
              />
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="p-4 sm:px-5 border-t border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onSkipCurrent}>
              <X className="size-3.5" />
              <span>{t`Non`}</span>
            </Button>
            {remainingCount > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkipAll}
                className="text-muted-foreground"
              >
                <Ban className="size-3.5" />
                <span>{t`Non pour tous`}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {remainingCount > 1 && (
              <Button
                variant="outline"
                tone="brand"
                size="sm"
                onClick={() => onConfirmAll(effectiveNote)}
              >
                <CheckCheck className="size-3.5" />
                <span>{t`Oui pour tous (${remainingCount})`}</span>
              </Button>
            )}
            <Button
              variant="solid"
              tone="brand"
              size="sm"
              onClick={() => onConfirmCurrent(effectiveNote)}
            >
              <Check className="size-3.5" />
              <span>{t`Oui`}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
