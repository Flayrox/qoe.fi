// =====================================================================
// 🪝 hooks.ts — Hooks React client (type-safe via le registre)
// =====================================================================
// 📖 Consommation :
//    import { useFlag, useFlags } from '@qoe/flags';
//    const showRecos = useFlag('feed-recommendations');
//    const { isOn } = useFlags();  // isOn('web-newsletter-banner')
// =====================================================================

'use client';

import { useFeatureIsOn, useFeatureValue, useGrowthBook } from '@growthbook/growthbook-react';
import { defaultFor, type FlagKey } from './flags';

/**
 * Retourne la valeur booléenne typée d'un flag, avec fallback = défaut du registre.
 */
export function useFlag<K extends FlagKey>(key: K): boolean {
  return useFeatureValue(key, defaultFor(key));
}

/**
 * Alias booléen explicite (false si éteint/indisponible).
 */
export function useFlagIsOn<K extends FlagKey>(key: K): boolean {
  return useFeatureIsOn(key);
}

/**
 * Instance GrowthBook typée (pour `setAttributes`, `refreshFeatures`, etc.).
 */
export { useGrowthBook };

/**
 * Accès à la volée depuis n'importe quel composant client :
 *    const { isOn } = useFlags();
 */
export function useFlags() {
  const gb = useGrowthBook();
  return {
    isOn: (key: FlagKey): boolean => gb?.getFeatureValue(key, defaultFor(key)) ?? defaultFor(key),
  };
}
