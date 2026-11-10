'use client';

import React, { useState } from 'react';
import { ShieldAlert, Check, Loader2 } from 'lucide-react';
import { toast } from '@qoe/ui/toast';
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
import { RadioCard, RadioGroup } from '@qoe/ui/radio-group';
import { createReportSchema, type CreateReportInput } from '@qoe/config/schemas';
import { reportTargetAction } from '@qoe/sdk/actions/feed';
import { t } from '@lingui/core/macro';

export interface ModerationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType?: 'thought' | 'article' | 'user';
}

export function ModerationReportModal({
  isOpen,
  onClose,
  targetId,
  targetType = 'thought',
}: ModerationReportModalProps) {
  const [reason, setReason] = useState<CreateReportInput['reason']>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reportReasons = [
    { id: 'spam', label: t`Spam ou publicité indésirable` },
    { id: 'harassment', label: t`Harcèlement ou intimidation` },
    {
      id: 'hate_speech',
      label: t`Discours haineux ou injurieux`,
    },
    {
      id: 'misleading',
      label: t`Fausse information / Désinformation`,
    },
    { id: 'other', label: t`Autre raison` },
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = { targetId, targetType, reason, details };
    const parsed = createReportSchema.safeParse(payload);

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || t`Champs invalides`);
      setSubmitting(false);
      return;
    }

    const res = await reportTargetAction(parsed.data);
    setSubmitting(false);

    if (res.ok) {
      setSubmitted(true);
      toast.success(t`Merci. Votre signalement a été transmis à la modération.`);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1500);
    } else {
      const errorMessage =
        typeof res.error === 'string'
          ? res.error
          : res.error?.message || t`Erreur lors de l'envoi du signalement.`;
      toast.error(errorMessage);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="md">
        {submitted ? (
          <DialogBody className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-success/10 border border-success/30 text-success-text flex items-center justify-center mx-auto text-xl font-bold">
              <Check className="w-6 h-6" />
            </div>
            <DialogTitle className="text-base">{t`Signalement envoyé`}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              {t`Notre équipe de modération va analyser cet élément dans les plus brefs délais.`}
            </p>
          </DialogBody>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-control bg-highlight/10 text-highlight">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle>{t`Signaler un contenu`}</DialogTitle>
                  <DialogDescription>
                    {t`Pourquoi souhaitez-vous signaler cette publisher ?`}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <RadioGroup
                aria-label={t`Motif du signalement`}
                value={reason}
                onChange={(val) => setReason(val as CreateReportInput['reason'])}
              >
                {reportReasons.map((r) => (
                  <RadioCard key={r.id} value={r.id} title={r.label} />
                ))}
              </RadioGroup>

              <Textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t`Détails complémentaires (optionnel)...`}
              />
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t`Annuler`}
              </Button>
              <Button type="submit" variant="solid" tone="danger" size="sm" disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                <span>{t`Signaler`}</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
