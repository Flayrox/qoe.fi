'use server';

// =====================================================================
// 📡 actions/features — actions de signaux de fonctionnalités
// =====================================================================
// Centralise la télémétrie produit et les promesses de notification
// relatives aux fonctionnalités à venir ou réservées (offres Pro).
//
// ⚠️ Fichier serveur : toutes les fonctions exportées DOIVENT être async.
// =====================================================================

import { goFetch } from '../utils/go-client';

export type FeatureSignalKind = 'view' | 'notify';

export interface FeatureCatalogState {
  key: string;
  status: string;
  notifyEnabled: boolean;
  notified: boolean;
}

export interface FeatureSignalResult {
  success: boolean;
  notified: boolean;
}

/**
 * Enregistre un signal d'intérêt (affichage ou demande de notification « me prévenir »).
 * Pour un signal de type 'view', les erreurs réseau sont ignorées silencieusement (télémétrie best-effort).
 * Pour un signal de type 'notify', l'erreur est propagée pour permettre à l'UI de réagir.
 */
export async function recordFeatureSignalAction(
  feature: string,
  kind: 'view' | 'notify',
  source?: string,
  publisherId?: string
): Promise<{ success: boolean; notified: boolean }> {
  try {
    return await goFetch<{ success: boolean; notified: boolean }>('/v1/features/signals', {
      method: 'POST',
      body: {
        feature,
        kind,
        source: source ?? 'studio',
        ...(publisherId ? { publisherId } : {}),
      },
    });
  } catch (err) {
    if (kind === 'view') return { success: false, notified: false };
    throw err;
  }
}

/**
 * Récupère le catalogue des fonctionnalités et leurs états côté serveur.
 */
export async function getFeatureCatalogAction(): Promise<FeatureCatalogState[]> {
  try {
    const res = await goFetch<{ features: FeatureCatalogState[] }>('/v1/features/catalog');
    return res.features ?? [];
  } catch {
    return [];
  }
}

/**
 * Retire l'inscription aux notifications de lancement pour une fonctionnalité.
 */
export async function unsubscribeFeatureAction(feature: string): Promise<{ success: boolean }> {
  await goFetch('/v1/features/interests/unsubscribe', {
    method: 'POST',
    body: { feature },
  });
  return { success: true };
}

/**
 * Récupère la liste des fonctionnalités pour lesquelles l'utilisateur connecté
 * a demandé à être notifié.
 */
export async function getMyFeatureNotificationsAction(): Promise<string[]> {
  try {
    const res = await goFetch<{ features: string[] }>('/v1/features/signals/state');
    return res.features ?? [];
  } catch {
    return [];
  }
}
