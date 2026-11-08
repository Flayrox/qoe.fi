'use server';

// =====================================================================
// 📡 apps/core/src/features/upcoming/actions.ts
// =====================================================================
// Mesure d'intérêt des fonctionnalités à venir côté Lecteur (source: 'site').
// Délégué au SDK centralisé @qoe/sdk/actions/features.
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import {
  recordFeatureSignalAction as recordSignalSdk,
  getFeatureCatalogAction as getCatalogSdk,
} from '@qoe/sdk/actions/features';

export type FeatureSignalKind = 'view' | 'notify';

export interface FeatureCatalogState {
  key: string;
  status: string;
  notifyEnabled: boolean;
  notified: boolean;
}

/**
 * Enregistre un signal côté lecteur (ouverture de l'annonce ou « me prévenir »).
 */
export async function recordFeatureSignalAction(
  feature: string,
  kind: FeatureSignalKind
): Promise<{ success: boolean; notified: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (kind === 'view') return { success: false, notified: false };
    throw new Error('Veuillez vous connecter pour être prévenu.');
  }

  return recordSignalSdk(feature, kind, 'site');
}

/**
 * État serveur du catalogue pour le lecteur.
 */
export async function getFeatureCatalogAction(): Promise<FeatureCatalogState[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return getCatalogSdk();
}
