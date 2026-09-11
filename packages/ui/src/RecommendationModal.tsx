'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { Check, Loader2, Sparkles, X, ArrowRight } from 'lucide-react';
import Image from 'next/image';

export interface RecommendedPublication {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  customDomain?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  authorAvatarUrl?: string | null;
  articlesCount?: number;
  subscribersCount?: number;
}

interface RecommendationModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorName?: string;
  recommendations: RecommendedPublication[];
  subscriberEmail: string;
}

export function RecommendationModal({
  isOpen,
  onClose,
  authorName,
  recommendations,
  subscriberEmail,
}: RecommendationModalProps) {
  // Pre-select all recommended publications by default (standard Substack pattern)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(recommendations.map((r) => r.id))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  if (!isOpen || recommendations.length === 0) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      // Subscribe to all selected publications in parallel
      await Promise.allSettled(
        Array.from(selectedIds).map((publicationId) =>
          subscribeToNewsletterAction({
            email: subscriberEmail,
            publicationId,
          })
        )
      );
      setCompleted(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch {
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-background text-foreground rounded-2xl border border-border shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/60 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label={t`Fermer`}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 text-[var(--tenant-accent,hsl(var(--primary)))] mb-2 font-medium text-xs tracking-wider uppercase">
            <Sparkles className="w-4 h-4" />
            <span>{t`Recommandations éditoriales`}</span>
          </div>

          <h3 className="text-xl font-semibold tracking-tight">
            {authorName
              ? t`${authorName} vous recommande également :`
              : t`Publications recommandées pour vous`}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t`Abonnez-vous en 1 clic aux auteurs qui partagent cette même vision d'exigence.`}
          </p>
        </div>

        {/* List of Recommended Publications */}
        <div className="p-6 overflow-y-auto space-y-3 divide-y divide-border/40">
          {recommendations.map((rec) => {
            const isChecked = selectedIds.has(rec.id);
            const avatar = rec.logoUrl || rec.authorAvatarUrl;

            return (
              <div
                key={rec.id}
                onClick={() => toggleSelect(rec.id)}
                className={`pt-3 first:pt-0 flex items-start gap-4 p-3 rounded-xl cursor-pointer transition-all ${
                  isChecked
                    ? 'bg-muted/50 border border-border/60'
                    : 'hover:bg-muted/30 border border-transparent'
                }`}
              >
                {/* Avatar / Logo */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border/40 mt-0.5">
                  {avatar ? (
                    <Image src={avatar} alt={rec.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-base text-muted-foreground">
                      {rec.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-sm truncate">{rec.name}</h4>
                    {rec.authorName && (
                      <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                        par {rec.authorName}
                      </span>
                    )}
                  </div>
                  {rec.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {rec.description}
                    </p>
                  )}
                </div>

                {/* Checkbox badge */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0 mt-1 border ${
                    isChecked
                      ? 'bg-foreground text-background border-foreground dark:bg-white dark:text-black dark:border-white'
                      : 'border-muted-foreground/40 bg-transparent'
                  }`}
                >
                  {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors order-2 sm:order-1"
          >
            {t`Passer cette étape`}
          </button>

          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full font-medium text-sm transition-all flex items-center justify-center gap-2 bg-foreground text-background hover:opacity-90 active:scale-95 disabled:opacity-50 order-1 sm:order-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t`Souscription...`}</span>
              </>
            ) : completed ? (
              <>
                <Check className="w-4 h-4 text-success" />
                <span>{t`Abonné !`}</span>
              </>
            ) : selectedIds.size > 0 ? (
              <>
                <span>{t`S'abonner aux ${selectedIds.size} publications`}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <span>{t`Continuer vers la lecture`}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
