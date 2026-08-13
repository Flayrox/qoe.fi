'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createReportSchema, type CreateReportInput } from '@qoe/config/schemas';
import { reportTargetAction } from '@qoe/api-client/actions/feed';
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

  if (!isOpen) return null;

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
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4 font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md bg-card border border-border/40 rounded-2xl p-6 shadow-2xl space-y-5 relative"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {submitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-success/10 border border-success/30 text-success flex items-center justify-center mx-auto text-xl font-bold">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-foreground">{t`Signalement envoyé`}</h3>
              <p className="text-xs text-muted-foreground">
                {t`Notre équipe de modération va analyser cet élément dans les plus brefs délais.`}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-highlight/10 text-highlight">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{t`Signaler un contenu`}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t`Pourquoi souhaitez-vous signaler cette publication ?`}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {reportReasons.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      reason === r.id
                        ? 'bg-brand/10 border-brand text-foreground font-semibold'
                        : 'bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => setReason(r.id)}
                      className="accent-brand"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <textarea
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t`Détails complémentaires (optionnel)...`}
                  className="w-full bg-muted/20 border border-border/40 rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {t`Annuler`}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium text-xs hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t`Signaler`}</span>
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
