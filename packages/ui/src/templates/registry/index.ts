// =====================================================================
// index.ts — Theme Archetype Registry (Qoefi Engine 2026)
// =====================================================================

export * from './types';
export * from './minimal';

import { minimalTheme } from './minimal';
import type { ThemeDefinition } from './types';

/**
 * Un seul thème est supporté : Minimal Craft. Les identifiants historiques
 * (`editorial`, `magazine`, `standard`, `dispatch`) ne sont plus enregistrés
 * et retombent tous sur minimal.
 */
export const THEME_REGISTRY: Record<string, ThemeDefinition> = {
  minimal: minimalTheme,
};

export function resolveTheme(archetypeId?: string | null): ThemeDefinition {
  void archetypeId;
  return minimalTheme;
}
