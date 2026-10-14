'use client';

// ═══════════════════════════════════════════════════════════════════
// 🌗 @qoe/theme — seed-script.tsx
// Script inline SSR anti-FOUC conforme React 19 & Next.js 16 :
//
// 1. En SSR (Serveur) :
//    Émet le <script id="qoe-theme-seed"> brut dans le HTML initial.
//    Le navigateur l'exécute immédiatement sur le premier paint (zéro flash).
//
// 2. Côté Client / Rendu React :
//    Le script est déjà présent dans le DOM (injecté par le SSR).
//    Le composant retourne `null` dès que le script est dans le DOM ou
//    sur le runtime client, afin que React 19 n'émette JAMAIS de balise
//    <script> dans son arbre de composants client (ce qui élimine le warning :
//    « Encountered a script tag while rendering React component »).
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { THEME_COOKIE } from './cookie';

export const THEME_SEED_SCRIPT_CONTENT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);if(m&&(m[1]==='light'||m[1]==='dark')){localStorage.setItem('theme',m[1]);var d=document.documentElement;if(m[1]==='dark'){d.classList.add('dark')}else{d.classList.remove('dark')}}}catch(e){}})();`;

const emptySubscribe = () => () => {};

export function ThemeSeedScript() {
  // Côté SSR (ou premier rendu serveur / renderToStaticMarkup) :
  // useSyncExternalStore utilise getServerSnapshot (= true) pour injecter
  // le <script id="qoe-theme-seed"> brut dans le HTML initial (zéro FOUC).
  //
  // Côté Client (navigateur / hydratation / Turbopack HMR) :
  // useSyncExternalStore utilise getSnapshot (= false) et retourne null.
  // React 19 ne rencontre ainsi JAMAIS de balise <script> dans l'arbre client,
  // ce qui élimine définitivement l'erreur :
  // « Encountered a script tag while rendering React component ».
  const isServer = React.useSyncExternalStore(
    emptySubscribe,
    () => false,
    () => true
  );

  if (!isServer) {
    return null;
  }

  return (
    <script
      id="qoe-theme-seed"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_SEED_SCRIPT_CONTENT }}
    />
  );
}
