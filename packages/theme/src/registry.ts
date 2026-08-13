// ═══════════════════════════════════════════════════════════════════
// 📋 @qoe/theme — registry.ts
// Registre type-safe des thèmes et accents disponibles.
// Utilisé par les settings créateur et l'admin pour lister les options.
// ═══════════════════════════════════════════════════════════════════

import type { AccentVariant, ThemeMode } from './types';

/** Thèmes (modes light/dark) exposés côté UI. */
export const THEMES = {
  light: { id: 'light', label: 'Light', dataTheme: 'light' },
  dark: { id: 'dark', label: 'Dark', dataTheme: 'dark' },
} as const;

/** Accents brand activables (opt-in). */
export const ACCENTS = {
  none: { id: 'none', label: 'Neutre', dataAccent: null },
  vermillion: { id: 'vermillion', label: 'Vermillon', dataAccent: 'vermillion' },
} as const;

export type ThemeId = keyof typeof THEMES;
export type AccentId = keyof typeof ACCENTS;

/**
 * Convertit un ThemeMode stocké en DB ("light" | "dark" | "system")
 * en valeur utilisable par next-themes `forcedTheme`.
 * "system" → undefined (next-themes suit le système, pas de forçage).
 */
export function resolveForcedTheme(mode: ThemeMode | string | null | undefined) {
  if (mode === 'light' || mode === 'dark') return mode;
  return undefined; // "system" ou null → next-themes gère
}

/**
 * Mappe un accentColor HEX libre (choisi par le créateur) vers une
 * AccentVariant connue du registre, ou "none" si non reconnu.
 */
export function resolveAccentFromColor(color: string | null | undefined): AccentVariant {
  if (!color) return 'none';
  const normalized = color.trim().toLowerCase();
  if (normalized === '#ee4b2b' || normalized === 'var(--vermillion-500)') {
    return 'vermillion';
  }
  // Couleur custom → traitée comme "none" côté variant,
  // mais l'override --primary sera injecté par <ThemeStyle>.
  return 'none';
}
