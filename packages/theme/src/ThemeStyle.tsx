// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — ThemeStyle.tsx
// Server Component : injecte les overrides de tokens tenant en SSR (zéro FOUC).
// ═══════════════════════════════════════════════════════════════════
//
// Remplace l'ancienne approche ad-hoc d'apps/web (objet customStyle inline
// avec "--tenant-accent": accentColor || "hsl(var(--primary))" — bug car
// les tokens ne sont pas en hsl).
//
// Ici on override directement --primary (et dérivés) sur :root du sous-arbre,
// ce que les composants consomment déjà via bg-primary / text-primary.

import * as React from 'react';
import type { CreatorTheme } from './types';
import { buildBackgroundVariables, isColorDark, parseHexColor } from './colors';

interface ThemeStyleProps {
  /** Données de branding créateur (depuis la DB). */
  creator: CreatorTheme;
  /** Scope CSS (défaut : ":root" — toute la page). Pour un sous-arbre, passer un sélecteur. */
  scope?: string;
}

/** Clé de registre de police : un identifiant CSS, jamais une déclaration. */
const FONT_KEY = /^[a-z][a-z0-9-]{0,31}$/i;

/**
 * Construit le dict des overrides de tokens pour un créateur.
 * Exporté pour permettre tests / preview / admin.
 *
 * ⚠️ Ces valeurs partent dans une feuille de style rendue en SSR : aucun
 * champ n'est concaténé sans validation. F142 — l'accent libre sortait tel
 * quel et `#fff;</style><script>…` refermait la balise ; la famille de police
 * permettait la même évasion.
 */
export function buildCreatorVars(creator: CreatorTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  if (creator.backgroundColor) {
    const bgVars = buildBackgroundVariables(creator.backgroundColor);
    Object.assign(vars, bgVars);
  }

  const accentColor = creator.accentColor?.trim();
  if (accentColor && parseHexColor(accentColor)) {
    vars['--primary'] = accentColor;
    vars['--primary-foreground'] = isColorDark(accentColor) ? '#ffffff' : '#09090b';
    vars['--ring'] = accentColor;
    vars['--sidebar-primary'] = accentColor;
    vars['--sidebar-ring'] = accentColor;
    vars['--accent-brand'] = accentColor;
    vars['--tenant-accent'] = accentColor;
  }

  const fontFamily = creator.fontFamily?.trim();
  if (fontFamily && FONT_KEY.test(fontFamily)) {
    // Mappe la clé famille vers la variable CSS --font-<key> exposée par @theme.
    vars['--font-active'] = `var(--font-${fontFamily})`;
  }

  return vars;
}

/**
 * Server Component qui rend un <style> injectant les vars tenant.
 * À placer en haut du layout tenant (apps/web), avant {children}.
 */
export function ThemeStyle({ creator, scope = ':root' }: ThemeStyleProps) {
  const vars = buildCreatorVars(creator);

  if (Object.keys(vars).length === 0) return null;

  const css = Object.entries(vars)
    .map(([k, v]) => {
      const prop = k === 'colorScheme' ? 'color-scheme' : k;
      return `${prop}: ${v};`;
    })
    .join(' ');

  return <style dangerouslySetInnerHTML={{ __html: `${scope} { ${css} }` }} />;
}
