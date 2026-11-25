'use client';

import React from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { t } from '@lingui/core/macro';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Button } from '@qoe/ui/button';

export interface AiSuggestionDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  suggestions: string[];
  onApply: (suggestion: string) => void;
  onRetry?: () => void;
}

export function AiSuggestionDialog({
  open,
  onClose,
  title,
  description,
  loading,
  error,
  suggestions,
  onApply,
  onRetry,
}: AiSuggestionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2 py-1">
          {loading ? (
            <div className="flex h-36 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t`L'assistant réfléchit…`}
            </div>
          ) : error ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 text-center">
              <p className="max-w-sm text-sm text-destructive-text">{error}</p>
              {onRetry ? (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  {t`Réessayer`}
                </Button>
              ) : null}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
              {t`Pas de suggestion pour ce texte.`}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {suggestions.map((suggestion, index) => (
                <li key={`${index}-${suggestion}`}>
                  <Button
                    variant="ghost"
                    block
                    onClick={() => {
                      onApply(suggestion);
                      onClose();
                    }}
                    className="group w-full! items-start gap-2 rounded-control border border-border/45 bg-muted/10 px-3 py-2 text-left text-sm! hover:border-primary/40 hover:bg-primary/5 leading-[20px]! h-auto! [font-weight:inherit]! whitespace-normal! justify-normal "
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug text-foreground">
                      {suggestion}
                    </span>
                    <ArrowRight
                      className="mt-0.5 size-3.5! shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden
                    />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t`Fermer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
