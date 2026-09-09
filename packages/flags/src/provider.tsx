// =====================================================================
// 🔌 provider.tsx — Provider client léger de Feature Flags
// =====================================================================
// 📖 Zéro SDK externe, zéro dépendance, 100% synchrone et sans flicker.
//    Si aucun provider n'est présent ou si les flags sont indéfinis,
//    useFlag() retombe immédiatement sur la valeur par défaut du registre.
// =====================================================================

'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { FLAGS, defaultFor, type FlagKey } from './flags';

const FlagsContext = createContext<Record<string, boolean>>(FLAGS);

export function FlagsProvider({
  flags,
  children,
}: {
  flags?: Partial<Record<FlagKey, boolean>> | null;
  children: ReactNode;
}) {
  const merged = useMemo(() => {
    return { ...FLAGS, ...flags };
  }, [flags]);

  return <FlagsContext.Provider value={merged}>{children}</FlagsContext.Provider>;
}

/**
 * Alias de compatibilité pour faciliter la transition
 */
export const GrowthBookProvider = FlagsProvider;

/**
 * Hook client pour lire l'état d'un flag (100% synchrone, 0ms, 0 appel réseau)
 */
export function useFlag(key: FlagKey): boolean {
  const context = useContext(FlagsContext);
  return context[key] ?? defaultFor(key);
}

/**
 * Hook client pour lire l'état de tous les flags
 */
export function useFlags(): Record<FlagKey, boolean> {
  const context = useContext(FlagsContext);
  return context as Record<FlagKey, boolean>;
}
