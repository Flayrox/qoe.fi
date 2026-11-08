'use server';

// =====================================================================
// 📡 apps/core/src/features/upcoming/actions.ts
// =====================================================================
// Mesure d'intérêt des fonctionnalités à venir côté Lecteur (source: 'site').
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

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

  try {
    return await goFetch<{ success: boolean; notified: boolean }>('/v1/features/signals', {
      method: 'POST',
      body: {
        feature,
        kind,
        source: 'site',
      },
    });
  } catch (err) {
    if (kind === 'view') return { success: false, notified: false };
    throw err;
  }
}

/**
 * État serveur du catalogue pour le lecteur.
 */
export async function getFeatureCatalogAction(): Promise<FeatureCatalogState[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const res = await goFetch<{ features: FeatureCatalogState[] }>('/v1/features/catalog');
    return res.features ?? [];
  } catch {
    return [];
  }
}
