'use client';

import React, { useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { Check, Loader2, Sparkles, X, ArrowRight } from 'lucide-react';
import { SafeAvatar } from './SafeAvatar';
import { Button } from './primitives/button/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './primitives/dialog/dialog';

export interface RecommendedPublisher {
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
  recommendations: RecommendedPublisher[];
  subscriberEmail: string;
}

/**
 * Recommandations éditoriales après une inscription.
 *
 * 🎯 C'était deux `<div>` posés en `fixed inset-0` : ni `role="dialog"`, ni
 *    `aria-modal`, ni titre associé, ni Échap, ni piège du focus. Un lecteur
 *    d'écran poursuivait sa lecture dans le blog derrière le voile, et au
 *    clavier la fenêtre était infranchissable. Elle repose maintenant sur
 *    `Dialog` (react-aria), comme `LoginModal` : focus confiné, Échap,
 *    clic sur le voile, restitution du focus à la fermeture.
 *
 * ☑️ Chaque publication est une vraie case à cocher (rôle, état, Espace et
 *    Entrée) : le badge rond était purement décoratif, donc invisible pour
 *    l'assistance technique et impossible à manipuler sans souris.
 *
 * 🔁 La sélection part de la liste **courante**. Elle était initialisée une
 *    seule fois : le formulaire d'abonnement gardant ce composant monté, un
 *    second abonné confirmait l'ancienne liste — des identifiants qui
 *    n'étaient même plus affichés.
 */
export function RecommendationModal({
  isOpen,
  onClose,
  authorName,
  recommendations,
  subscriberEmail,
}: RecommendationModalProps) {
  // Signature stable de la liste : elle change quand les recommandations
  // changent, pas quand le parent renvoie un tableau neuf avec les mêmes ids.
  const recommendationIds = recommendations.map((rec) => rec.id).join('|');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(recommendations.map((r) => r.id))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set(recommendationIds ? recommendationIds.split('|') : []));
  }, [recommendationIds]);

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
        Array.from(selectedIds).map((publisherId) =>
          subscribeToNewsletterAction({
            email: subscriberEmail,
            publisherId,
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

  if (!isOpen || recommendations.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] w-full max-w-lg overflow-hidden p-0 sm:max-w-lg"
      >
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <header className="relative border-b border-border/60 p-6 pb-4">
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  shape="icon"
                  size="sm"
                  className="absolute top-5 right-5 rounded-full"
                />
              }
            >
              <X className="w-4 h-4" aria-hidden />
              <span className="sr-only">{t`Fermer`}</span>
            </DialogClose>

            <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wider text-[var(--tenant-accent,hsl(var(--primary)))] uppercase">
              <Sparkles className="w-4 h-4" aria-hidden />
              <span>{t`Recommandations éditoriales`}</span>
            </div>

            {/* Le titre de la boîte : c'est lui qui donne son nom au dialogue. */}
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {authorName
                ? t`${authorName} vous recommande également :`
                : t`Publishers recommandées pour vous`}
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t`Abonnez-vous en 1 clic aux auteurs qui partagent cette même vision d'exigence.`}
            </p>
          </header>

          {/* List of Recommended Publishers */}
          <div className="space-y-3 divide-y divide-border/40 overflow-y-auto p-6">
            {recommendations.map((rec) => {
              const isChecked = selectedIds.has(rec.id);
              const avatar = rec.logoUrl || rec.authorAvatarUrl;
              const descriptionId = `recommendation-${rec.id}-description`;

              return (
                <div
                  key={rec.id}
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={t`S'abonner à ${rec.name}`}
                  aria-describedby={rec.description ? descriptionId : undefined}
                  tabIndex={0}
                  onClick={() => toggleSelect(rec.id)}
                  onKeyDown={(event) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      toggleSelect(rec.id);
                    }
                  }}
                  className={`flex cursor-pointer items-start gap-4 rounded-xl border p-3 pt-3 transition-all first:pt-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    isChecked
                      ? 'border-border/60 bg-muted/50'
                      : 'border-transparent hover:bg-muted/30'
                  }`}
                >
                  {/* Avatar / Logo */}
                  <SafeAvatar
                    id={rec.id}
                    src={avatar}
                    name={rec.name}
                    username={rec.slug || rec.subdomain}
                    size={48}
                    shape="squircle"
                    className="mt-0.5 shrink-0 rounded-xl border border-border/40"
                  />

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-sm font-semibold">{rec.name}</h4>
                      {rec.authorName && (
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                          {t`par ${rec.authorName}`}
                        </span>
                      )}
                    </div>
                    {rec.description && (
                      <p
                        id={descriptionId}
                        className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                      >
                        {rec.description}
                      </p>
                    )}
                  </div>

                  {/* État de sélection : décoratif, `aria-checked` porte la vérité. */}
                  <div
                    aria-hidden
                    className={`mt-1 h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-all inline-flex ${
                      isChecked
                        ? 'border-foreground bg-foreground text-background dark:border-white dark:bg-white dark:text-black'
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
          <footer className="flex flex-col items-center justify-between gap-3 border-t border-border/60 bg-muted/20 p-4 sm:flex-row sm:p-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="order-2 text-xs sm:order-1"
            >
              {t`Passer cette étape`}
            </Button>

            <Button
              type="button"
              tone="brand"
              size="sm"
              onClick={handleConfirm}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="order-1 w-full rounded-full sm:order-2 sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  <span>{t`Souscription...`}</span>
                </>
              ) : completed ? (
                <>
                  <Check className="w-4 h-4 text-success-text" aria-hidden />
                  <span>{t`Abonné !`}</span>
                </>
              ) : selectedIds.size > 0 ? (
                <>
                  <span>
                    {selectedIds.size === 1
                      ? t`S'abonner à 1 publication`
                      : t`S'abonner aux ${selectedIds.size} publications`}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </>
              ) : (
                <span>{t`Continuer vers la lecture`}</span>
              )}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
