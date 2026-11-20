'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { cn } from '@qoe/utils';

// =====================================================================
// 🧭 MainContentWrapper — le conteneur de page du lecteur
// =====================================================================
// La sidebar (9 entrées) et l'en-tête mobile précèdent le contenu sur
// CHAQUE page : sans lien d'évitement, un utilisateur au clavier doit les
// retraverser à chaque navigation (WCAG 2.4.1 « Bypass Blocks »).
// L'ancre vise `<main id>` rendu focalisable (`tabindex="-1"`) pour que le
// focus suive réellement le saut sur tous les navigateurs.
// =====================================================================

export const MAIN_CONTENT_ID = 'contenu-principal';

export function MainContentWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn('min-h-screen transition-all duration-300 w-full pt-14 md:pt-0 md:pl-[256px]')}
    >
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-xl focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {t`Aller au contenu principal`}
      </a>
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 w-full min-h-screen outline-none">
        {children}
      </main>
    </div>
  );
}
