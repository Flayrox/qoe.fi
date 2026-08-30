'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { Flag, Loader2, Check } from 'lucide-react';
import { reportTargetAction } from '@qoe/sdk/actions/feed';
import { toast } from '@qoe/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType?: 'thought' | 'article' | 'user' | 'comment';
  authorName?: string;
}

const REPORT_REASONS = [
  { id: 'spam' },
  { id: 'harassment' },
  { id: 'misleading' },
  { id: 'hate_speech' },
  { id: 'other' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

// Libellés résolus au rendu pour suivre la langue active.
function getReportReasonLabel(reason: ReportReason): string {
  switch (reason) {
    case 'spam':
      return t`Spam ou publicité non sollicitée`;
    case 'harassment':
      return t`Harcèlement, haine ou intimidation`;
    case 'misleading':
      return t`Désinformation ou propos trompeurs`;
    case 'hate_speech':
      return t`Contenu inapproprié ou explicite`;
    case 'other':
      return t`Autre motif`;
  }
}

export function ReportModal({
  isOpen,
  onClose,
  targetId,
  targetType = 'thought',
  authorName,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await reportTargetAction({
        targetId,
        targetType,
        reason: selectedReason,
        details: details.trim() || undefined,
      });

      if (res.ok) {
        toast.success(t`Signalement transmis à l'équipe de modération.`);
        onClose();
      } else {
        toast.error(t`Erreur lors de l'envoi du signalement.`);
      }
    } catch {
      toast.error(t`Erreur réseau.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md p-6 rounded-2xl bg-card border border-border/40 shadow-2xl font-sans">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Flag className="w-4 h-4 text-highlight" />
            <span>{t`Signaler le contenu`}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t`Aidez-nous à préserver la qualité de la communauté`}
            {authorName ? ` (${authorName})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">{t`Motif du signalement`}</label>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedReason(r.id)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
                    selectedReason === r.id
                      ? 'border-highlight/50 bg-highlight/10 text-foreground'
                      : 'border-border/30 bg-background/50 hover:bg-muted/30 text-muted-foreground'
                  }`}
                >
                  <span>{getReportReasonLabel(r.id)}</span>
                  {selectedReason === r.id && <Check className="w-3.5 h-3.5 text-highlight" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">{t`Précisions (optionnel)`}</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t`Expliquez brièvement le problème...`}
              rows={3}
              className="w-full p-2.5 rounded-xl border border-border/40 bg-background text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-highlight resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {t`Annuler`}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-xl bg-highlight text-black text-xs font-semibold hover:bg-highlight/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{t`Envoyer`}</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
