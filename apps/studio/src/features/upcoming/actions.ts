'use server';

// =====================================================================
// 📡 apps/studio/src/features/upcoming/actions.ts
// =====================================================================
// Mesure d'intérêt des fonctionnalités à venir / Pro.
//
// 🎯 Attribution : la publication est résolue ICI depuis l'espace actif
//    (publication personnelle du créateur ou média sélectionné), jamais
//    depuis le navigateur — un client ne décide pas de ses stats.

import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export type FeatureSignalKind = 'view' | 'notify';

export interface FeatureSignalSummary {
  feature: string;
  views: number;
  notifies: number;
}

/**
 * Enregistre un signal (ouverture de l'annonce ou « me prévenir »).
 * Best-effort côté produit : l'appelant n'affiche jamais une erreur brute,
 * mais l'échec est remonté pour que le bouton puisse proposer de réessayer.
 */
export async function recordFeatureSignalAction(
  feature: string,
  kind: FeatureSignalKind
): Promise<{ success: boolean; notified: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non autorisé');

  const workspace = await getActiveWorkspace(user.id);

  try {
    return await goFetch<{ success: boolean; notified: boolean }>('/v1/features/signals', {
      method: 'POST',
      body: {
        feature,
        kind,
        source: 'studio',
        publicationId: workspace.publicationId,
      },
    });
  } catch (err) {
    // Une vue est un signal de confort : elle ne doit JAMAIS faire échouer la
    // requête serveur qui affiche les réglages (pas de 500 sur une page saine
    // parce que la télémétrie est indisponible).
    if (kind === 'view') return { success: false, notified: false };
    // « Me prévenir » est une promesse explicite : l'échec remonte pour que
    // l'interstitiel propose de réessayer au lieu d'afficher un faux succès.
    throw err;
  }
}

/**
 * Fonctionnalités déjà demandées par l'utilisateur connecté.
 * Une intention est globale au compte (cf. index unique côté Go) : elle
 * survit donc au rechargement et au changement d'espace.
 */
export async function getFeatureNotifiedAction(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const res = await goFetch<{ features: string[] }>('/v1/features/signals/state');
    return res.features ?? [];
  } catch {
    return [];
  }
}

/**
 * Agrégat des signaux de l'espace actif sur 90 jours (bloc analytics).
 * Retourne un tableau vide si l'API est indisponible : les statistiques
 * secondaires ne doivent jamais casser la page analytics.
 */
export async function getFeatureSignalSummaryAction(): Promise<FeatureSignalSummary[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const workspace = await getActiveWorkspace(user.id);
    const res = await goFetch<{ signals: FeatureSignalSummary[] }>(
      `/v1/features/signals/summary?publicationId=${encodeURIComponent(workspace.publicationId)}`
    );
    return res.signals ?? [];
  } catch {
    return [];
  }
}
