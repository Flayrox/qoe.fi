'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@lingui/core/macro';
import { X } from 'lucide-react';
import { LoginFormBento } from './LoginFormBento';
import type { AuthActionContext } from './GuestFloatingBar';
import { Button } from './primitives/button/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './primitives/dialog/dialog';
export type { AuthActionContext };

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup' | 'magic-link';
  actionContext?: AuthActionContext;
  nextUrl?: string;
}

/**
 * La porte d'entrée de l'authentification dans core.
 *
 * 🎯 Ce qui a changé : la modale était un `<div className="fixed inset-0">`
 *    animé à la main. Elle n'avait ni `role="dialog"`, ni `aria-modal`, ni
 *    piège du focus, ni Échap, ni restitution du focus au déclencheur — un
 *    lecteur d'écran continuait à parcourir la page derrière.
 *
 *    Elle repose maintenant sur `Dialog` (Base UI), qui apporte exactement
 *    ces quatre choses. Ce qui reste ici : le nom accessible, la fermeture
 *    au clic extérieur, et la re-synchronisation des composants serveur
 *    après connexion (pour que le layout tenant ouvre son onboarding sans
 *    rechargement complet).
 *
 * 🪟 La modale monte la variante `compact` du formulaire : une popup n'a pas
 *    la place d'un plateau 55/45, et la colonne de manifeste y volait le
 *    focus visuel. La page `/login` garde, elle, le bento complet.
 *
 * ⚠️ L'ancienne animation laissait la modale à `scale: 0.9` en état final
 *    (le `animate` valait 0.9, pas 1) : elle restait 10 % plus petite que
 *    sa propre mise en page, et les rayons paraissaient flous.
 */
export function LoginModal({
  isOpen,
  onClose,
  initialMode = 'login',
  actionContext,
}: LoginModalProps) {
  const router = useRouter();

  const handleSuccess = () => {
    onClose();
    router.refresh();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        // Le contenu porte sa propre surface (bento) : pas de carte blanche
        // par-dessus une autre carte blanche.
        className="max-h-[92vh] border-0 bg-transparent p-0 shadow-none sm:max-w-md"
      >
        {/* Nom accessible de la boîte de dialogue. Sans lui, Base UI
            annoncerait « dialogue » et rien d'autre. */}
        <DialogTitle className="sr-only">
          {initialMode === 'signup' ? t`Créer un compte` : t`Se connecter`}
        </DialogTitle>

        {/* Fermeture explicite en plus de l'overlay et d'Échap : sur un
            écran tactile, viser le fond n'est pas un geste fiable. */}
        <DialogClose
          render={
            <Button
              variant="ghost"
              shape="icon"
              size="sm"
              className="absolute top-3 right-3 z-20 rounded-full bg-card shadow-sm"
            />
          }
        >
          <X className="size-4" strokeWidth={1.75} />
          <span className="sr-only">{t`Fermer`}</span>
        </DialogClose>

        <div className="relative my-auto w-full overflow-y-auto">
          <LoginFormBento
            variant="compact"
            initialMode={initialMode}
            actionContext={actionContext}
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
