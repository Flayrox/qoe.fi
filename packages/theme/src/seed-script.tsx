// ═══════════════════════════════════════════════════════════════════
// 🌗 @qoe/theme — seed-script.tsx
// Script inline SSR : lit le cookie partagé qoe_theme et le copie dans
// localStorage AVANT l'hydratation, pour que next-themes applique le
// bon thème dès le premier paint (évite le flash clair/sombre).
//
// ⚠️ Place dans le <head> de chaque root layout, AVANT le <ThemeProvider>.
// ⚠️ next-themes lit localStorage (clé "theme") à l'init → on le pré-seed.
//
// Pourquoi un <script> brut et PAS next/script :
//   next/script expose un composant *client*. Sur un router.refresh() ou une
//   navigation (ex. après un login via le panneau dev), React re-rend ce
//   composant côté client et émet un vrai <script> → warning React
//   « Encountered a script tag while rendering React component ».
//   Un <script> brut dans un serveur component n'est JAMAIS re-rendu par le
//   runtime client : React 19 le hoiste dans le <head> au SSR et le restream
//   RSC gère seul les mises à jour. Donc pas de warning, jamais.
// ═══════════════════════════════════════════════════════════════════

import { THEME_COOKIE } from './cookie';

const SEED_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);if(m&&(m[1]==='light'||m[1]==='dark')){localStorage.setItem('theme',m[1]);var d=document.documentElement;if(m[1]==='dark'){d.classList.add('dark')}else{d.classList.remove('dark')}}}catch(e){}})();`;

export function ThemeSeedScript() {
  return (
    <script
      id="qoe-theme-seed"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SEED_SCRIPT }}
    />
  );
}
