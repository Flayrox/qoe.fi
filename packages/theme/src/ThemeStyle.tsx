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

import * as React from "react";
import type { CreatorTheme } from "./types";

interface ThemeStyleProps {
  /** Données de branding créateur (depuis la DB). */
  creator: CreatorTheme;
  /** Scope CSS (défaut : ":root" — toute la page). Pour un sous-arbre, passer un sélecteur. */
  scope?: string;
}

/**
 * Construit le dict des overrides de tokens pour un créateur.
 * Exporté pour permettre tests / preview / admin.
 */
export function buildCreatorVars(creator: CreatorTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  if (creator.accentColor) {
    vars["--primary"] = creator.accentColor;
    vars["--ring"] = creator.accentColor;
    vars["--sidebar-primary"] = creator.accentColor;
    vars["--sidebar-ring"] = creator.accentColor;
    vars["--accent-brand"] = creator.accentColor;
  }

  if (creator.fontFamily) {
    // Mappe la clé famille vers la variable CSS --font-<key> exposée par @theme.
    vars["--font-active"] = `var(--font-${creator.fontFamily})`;
  }

  return vars;
}

/**
 * Server Component qui rend un <style> injectant les vars tenant.
 * À placer en haut du layout tenant (apps/web), avant {children}.
 */
export function ThemeStyle({ creator, scope = ":root" }: ThemeStyleProps) {
  const vars = buildCreatorVars(creator);

  if (Object.keys(vars).length === 0) return null;

  const css = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");

  return (
    <style
      dangerouslySetInnerHTML={{ __html: `${scope} { ${css} }` }}
    />
  );
}
