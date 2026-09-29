'use client';

import React from 'react';
import { useFlag } from './provider';
import type { FlagKey } from './flags';

export interface FeatureGateProps {
  /** Clé de feature flag type-safe issue du registre */
  flag: FlagKey;
  /** Contenu affiché si le flag est activé */
  children: React.ReactNode;
  /** Contenu affiché si le flag est désactivé (optionnel, par défaut null) */
  fallback?: React.ReactNode;
}

/**
 * 🚪 FeatureGate — Garde déclarative de composant.
 * Contrôle l'affichage et l'exécution d'un bloc selon l'état du flag côté client ou serveur.
 */
export function FeatureGate({ flag, children, fallback = null }: FeatureGateProps) {
  const isEnabled = useFlag(flag);

  if (!isEnabled) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
