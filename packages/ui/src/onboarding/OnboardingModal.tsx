'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { t } from '@lingui/core/macro';

import { Dialog, DialogContent } from '../primitives/dialog/dialog';
import { OnboardingFlow, type OnboardingFlowProps } from './OnboardingFlow';

export interface OnboardingModalProps extends OnboardingFlowProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** false (défaut) = onboarding obligatoire : pas de fermeture tant qu'il n'est pas terminé. */
  dismissible?: boolean;
}

/**
 * Accueil d'un nouveau lecteur.
 *
 * 🔁 F136 — c'était un portail maison (`fixed inset-0` + `AnimatePresence`) :
 *    aucun `role="dialog"`, aucun `aria-modal`, aucun piège ni restitution du
 *    focus. Un écran qui bloque tout le produit laissait donc tabuler dans la
 *    page derrière lui. Il repose maintenant sur `Dialog`/`DialogContent`
 *    (react-aria) ; Échap ne ferme que si l'onboarding est facultatif, et le
 *    verrou de défilement n'est plus posé à la main.
 */
export function OnboardingModal({
  open,
  onOpenChange,
  dismissible = false,
  categories,
  suggestedCreators,
  onSubmit,
}: OnboardingModalProps) {
  const router = useRouter();

  return (
    <Dialog
      isOpen={open}
      isDismissable={dismissible}
      onOpenChange={(next) => {
        if (!next && dismissible) onOpenChange?.(false);
      }}
    >
      <DialogContent
        aria-label={t`Bienvenue sur qoefi`}
        showCloseButton={false}
        overlayClassName="z-[999999]"
        className="max-h-[92vh] w-full gap-0 overflow-y-auto p-0 sm:max-w-5xl sm:p-0"
      >
        {dismissible && (
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="absolute top-3 right-3 z-20 rounded-full border border-border bg-card p-2.5 text-card-foreground shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            aria-label={t`Fermer`}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}

        <OnboardingFlow
          categories={categories}
          suggestedCreators={suggestedCreators}
          onSubmit={onSubmit}
          onDone={() => {
            onOpenChange?.(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
