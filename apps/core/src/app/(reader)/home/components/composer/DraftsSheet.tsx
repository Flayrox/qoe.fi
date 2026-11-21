'use client';

import React from 'react';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@qoe/ui/ui/sheet';
import { LOCAL_THREAD_DRAFT_KEY, parseStoredThreadNodes } from '../composer-drafts';
import type { ThoughtDraft } from './types';

interface DraftsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: ThoughtDraft[];
  loadingDrafts: boolean;
  onClearLocalThreadDraft: () => void;
  onRestoreLocalThreadDraft: () => void;
  onLoadDraft: (draft: ThoughtDraft) => void;
  onDeleteDraft: (draftId: string) => void;
}

function formatLocalDraftPreview(raw: string): string {
  const nodes = parseStoredThreadNodes(raw);
  if (!nodes) {
    return 'Restaurer votre brouillon de fil de discussion.';
  }
  return (
    nodes
      .map((n) => n.text)
      .filter(Boolean)
      .join(' → ') || 'Contenu du fil vide ou images uniquement'
  );
}

export function DraftsSheet({
  open,
  onOpenChange,
  drafts,
  loadingDrafts,
  onClearLocalThreadDraft,
  onRestoreLocalThreadDraft,
  onLoadDraft,
  onDeleteDraft,
}: DraftsSheetProps) {
  const rawLocalDraft =
    typeof window !== 'undefined' ? localStorage.getItem(LOCAL_THREAD_DRAFT_KEY) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right">
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col h-full bg-[var(--surface-0)] border-l border-[var(--border-default)] z-[60]">
        <SheetHeader className="p-6 border-b border-[var(--border-subtle)]">
          <SheetTitle className="text-base font-bold text-[var(--text-primary)]">
            Mes Brouillons
          </SheetTitle>
          <SheetDescription className="text-xs text-[var(--text-tertiary)]">
            Retrouvez et modifiez vos pensées enregistrées.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-sans">
          {rawLocalDraft && (
            <div className="border border-primary/25 bg-primary/5 rounded-[var(--radius-card)] p-4 space-y-2.5 flex flex-col justify-between mb-4">
              <div className="space-y-1.5">
                <span className="text-[9px] uppercase tracking-wider text-primary font-bold block">
                  Brouillon de Fil Local (Multi-Post)
                </span>
                <p className="text-xs text-[var(--text-primary)] font-serif leading-relaxed line-clamp-3">
                  {formatLocalDraftPreview(rawLocalDraft)}
                </p>
              </div>
              <div className="flex justify-between items-center pt-2.5 border-t border-primary/10">
                <Button
                  variant="ghost"
                  onClick={onClearLocalThreadDraft}
                  className="text-[10px]! font-semibold text-muted-foreground hover:text-destructive-text hover:bg-destructive/10 px-2 py-1 rounded-[var(--radius-button)] transition-colors cursor-pointer h-[auto]! leading-[inherit]!"
                >
                  Effacer
                </Button>
                <Button
                  variant="ghost"
                  onClick={onRestoreLocalThreadDraft}
                  className="text-[10px]! font-bold text-white bg-primary hover:opacity-95 hover:bg-transparent px-2.5 py-1 rounded-[var(--radius-button)] transition-all cursor-pointer h-[auto]! leading-[inherit]!"
                >
                  Restaurer le fil
                </Button>
              </div>
            </div>
          )}

          {loadingDrafts ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--qoe-vermillion)]" />
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                Chargement des brouillons...
              </span>
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <FileText className="w-8 h-8 text-[var(--text-quaternary)]" />
              <p className="text-xs text-[var(--text-secondary)] font-serif">
                Vous n&apos;avez aucun brouillon pour le moment.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="group border border-[var(--border-default)] rounded-[var(--radius-card)] p-4 bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-all duration-300 flex flex-col justify-between gap-3 relative"
                >
                  <div className="space-y-1 pr-8">
                    <p className="text-[13px] text-[var(--text-primary)] font-serif leading-relaxed line-clamp-3 whitespace-pre-wrap">
                      {draft.content}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold bg-[var(--surface-2)] px-2 py-0.5 rounded-[var(--radius-button)]">
                        {draft.visibility === 'public' ? 'Public' : 'Followers'}
                      </span>
                      {draft.scheduledAt && (
                        <span className="text-[9px] text-[var(--qoe-vermillion)] bg-[var(--qoe-vermillion-08)] px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                          Planifié
                        </span>
                      )}
                      {draft.triggerWarning && (
                        <span className="text-[9px] text-highlight bg-highlight/10 px-2 py-0.5 rounded-[var(--radius-button)] font-medium">
                          Warning
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 mt-1">
                    <span className="text-[9px] text-[var(--text-tertiary)]">
                      Mis à jour{' '}
                      {new Date(
                        draft.updatedAt || draft.scheduledAt || new Date()
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    <Button
                      variant="ghost"
                      onClick={() => onLoadDraft(draft)}
                      className="text-[10px]! font-bold text-[var(--qoe-vermillion)] hover:text-[#d63d20] hover:bg-transparent bg-[var(--qoe-vermillion-08)] px-2.5 py-1 rounded-[var(--radius-button)] transition-all cursor-pointer h-[auto]! leading-[inherit]!"
                    >
                      Charger
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => onDeleteDraft(draft.id)}
                    className="absolute top-4 right-4 text-[var(--text-quaternary)] hover:text-[var(--qoe-vermillion)] transition-colors p-1.5 rounded-[var(--radius-button)] cursor-pointer h-[auto]! leading-[inherit]! hover:bg-transparent"
                    title="Supprimer le brouillon"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
