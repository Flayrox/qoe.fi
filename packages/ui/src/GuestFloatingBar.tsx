'use client';

import React from 'react';
import { Bookmark, UserPlus, LogIn } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { t } from '@lingui/core/macro';

import { Button } from './primitives/button/button';

export type AuthActionContext = 'like' | 'follow' | 'bookmark' | 'comment' | 'repost' | 'delete';

interface GuestFloatingBarProps {
  onOpenAuth: (options: { mode: 'login' | 'signup'; actionContext?: AuthActionContext }) => void;
  labels?: {
    bookmarkTooltip?: string;
    signupBtn?: string;
    loginBtn?: string;
  };
}

/**
 * La barre qui invite un visiteur non connecté à rejoindre qoefi.
 *
 * 🎯 Trois corrections par rapport à la version précédente, toutes visibles
 *    au clavier ou au lecteur d'écran :
 *
 *    1. **Les boutons sont ceux du contrat.** L'ancienne barre avait trois
 *       `<button>` bruts, hauteurs 40 px et 32 px, sans anneau de focus : au
 *       clavier, on ne savait pas où on était.
 *    2. **Un nom accessible, pas une infobulle.** Le seul bouton-icône
 *       s'appuyait sur `title`, qui n'est pas lu par tous les lecteurs
 *       d'écran et n'apparaît qu'au survol. Il a maintenant un `aria-label`
 *       explicite, et `title` reste en complément visuel.
 *    3. **Le mouvement respecte la préférence système.** L'entrée animée
 *       (300 ms de délai, 30 px de translation) est supprimée si
 *       `prefers-reduced-motion` est actif.
 *
 * 📐 `env(safe-area-inset-bottom)` : sur un iPhone à encoche, une barre
 *    collée à `bottom-6` passe sous la barre de geste.
 */
export function GuestFloatingBar({ onOpenAuth, labels }: GuestFloatingBarProps) {
  const reduceMotion = useReducedMotion();
  const bookmarkLabel = labels?.bookmarkTooltip || t`Enregistrer dans le sanctuaire`;

  return (
    <motion.div
      role="group"
      aria-label={t`Rejoindre qoefi`}
      initial={reduceMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion ? { duration: 0 } : { delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }
      }
      className="pointer-events-auto fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-panel border border-border/80 bg-card/90 p-2 shadow-xl backdrop-blur-md select-none sm:max-w-md"
    >
      <Button
        variant="ghost"
        shape="icon"
        size="sm"
        aria-label={bookmarkLabel}
        title={bookmarkLabel}
        onClick={() => onOpenAuth({ mode: 'signup', actionContext: 'bookmark' })}
      >
        <Bookmark className="size-4" strokeWidth={1.75} />
      </Button>

      <span aria-hidden className="h-5 w-px bg-border/60" />

      <Button
        variant="solid"
        tone="brand"
        size="sm"
        onClick={() => onOpenAuth({ mode: 'signup', actionContext: 'follow' })}
      >
        <UserPlus className="size-3.5" strokeWidth={1.75} />
        {labels?.signupBtn || t`Rejoindre qoefi`}
      </Button>

      <span aria-hidden className="h-5 w-px bg-border/60" />

      <Button variant="ghost" size="sm" onClick={() => onOpenAuth({ mode: 'login' })}>
        <LogIn className="size-3.5" strokeWidth={1.75} />
        {labels?.loginBtn || t`Connexion`}
      </Button>
    </motion.div>
  );
}
