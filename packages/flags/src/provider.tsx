// =====================================================================
// 🔌 provider.tsx — Provider client léger de Feature Flags
// =====================================================================
// 📖 Zéro SDK externe, zéro dépendance, 100% synchrone et sans flicker.
//    Si aucun provider n'est présent ou si les flags sont indéfinis,
//    useFlag() retombe immédiatement sur la valeur par défaut du registre.
// =====================================================================

'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { FLAGS, defaultFor, hasFlag, type FlagKey } from './flags';

type FlagMap = Readonly<Record<FlagKey, boolean>>;

const FlagsContext = createContext<FlagMap>(FLAGS);

/**
 * Fusionne les flags SSR avec le registre : seules les clés connues et les
 * vraies valeurs booléennes sont retenues (une valeur `undefined`, un nombre
 * ou une clé inconnue ne doivent pas écraser un défaut).
 */
function mergeFlags(flags?: Partial<Record<FlagKey, boolean>> | null): FlagMap {
  const merged: Record<FlagKey, boolean> = { ...FLAGS };
  if (flags) {
    for (const [key, value] of Object.entries(flags)) {
      if (hasFlag(key) && typeof value === 'boolean') {
        merged[key] = value;
      }
    }
  }
  return Object.freeze(merged);
}

export function FlagsProvider({
  flags,
  children,
}: {
  flags?: Partial<Record<FlagKey, boolean>> | null;
  children: ReactNode;
}) {
  const value = useMemo(() => mergeFlags(flags), [flags]);

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
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
  const value = context[key];
  return typeof value === 'boolean' ? value : defaultFor(key);
}

/**
 * Hook client pour lire l'état de tous les flags (objet gelé, partagé).
 */
export function useFlags(): FlagMap {
  return useContext(FlagsContext);
}
