// =====================================================================
// 🪝 hooks.ts — Hooks React client (type-safe via le registre)
// =====================================================================
// 📖 Consommation :
//    import { useFlag, useFlags } from '@qoe/flags';
//    const showRecos = useFlag('feed-recommendations');
//    const { isOn } = useFlags();
// =====================================================================

'use client';

import { useFlag, useFlags } from './provider';
import type { FlagKey } from './flags';

export { useFlag, useFlags };

/**
 * Alias booléen explicite (synonyme de useFlag)
 */
export function useFlagIsOn(key: FlagKey): boolean {
  return useFlag(key);
}

/**
 * Stub de compatibilité no-op
 */
export function useGrowthBook() {
  return null;
}
