// ═══════════════════════════════════════════════════════════════════
// 🌗 @qoe/theme — seed-script.tsx
// Script inline SSR : lit le cookie partagé qoe_theme et le copie dans
// localStorage AVANT l'hydratation, pour que next-themes applique le
// bon thème dès le premier paint (évite le flash clair/sombre).
//
// ⚠️ Place dans <head> de chaque root layout, AVANT le <ThemeProvider>.
// ⚠️ next-themes lit localStorage (clé "theme") à l'init → on le pré-seed.
// ═══════════════════════════════════════════════════════════════════

import { THEME_COOKIE } from './cookie';

const SEED_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);if(m&&(m[1]==='light'||m[1]==='dark')){localStorage.setItem('theme',m[1]);var d=document.documentElement;if(m[1]==='dark'){d.classList.add('dark')}else{d.classList.remove('dark')}}}catch(e){}})();`;

export function ThemeSeedScript() {
  return <script dangerouslySetInnerHTML={{ __html: SEED_SCRIPT }} />;
}
