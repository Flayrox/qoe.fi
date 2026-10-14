// =====================================================================
// index.ts — Theme Archetype Registry Polymorphe (Qoefi Engine 2026)
// =====================================================================

export * from './types';
export * from './minimal';
export * from './standard';
export * from './editorial';
export * from './dispatch';

import { minimalTheme } from './minimal';
import { standardTheme } from './standard';
import { editorialTheme } from './editorial';
import { dispatchTheme } from './dispatch';
import type { ThemeDefinition } from './types';

export const THEME_REGISTRY: Record<string, ThemeDefinition> = {
  minimal: minimalTheme,
  standard: standardTheme,
  magazine: editorialTheme,
  editorial: editorialTheme,
  dispatch: dispatchTheme,
};

/**
 * Résout la définition de thème associée à un identifiant d'archétype.
 * Si l'identifiant est absent ou inconnu, repli sécurisé sur 'standard'.
 */
export function resolveTheme(archetypeId?: string | null): ThemeDefinition {
  if (!archetypeId || !THEME_REGISTRY[archetypeId]) {
    return THEME_REGISTRY.standard;
  }
  return THEME_REGISTRY[archetypeId];
}
