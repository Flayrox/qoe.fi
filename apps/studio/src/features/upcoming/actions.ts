'use server';

// =====================================================================
// 📡 apps/studio/src/features/upcoming/actions.ts
// =====================================================================
// Mesure d'intérêt des fonctionnalités à venir / Pro.
// Délégué au SDK centralisé @qoe/sdk/actions/features.
//
// 🎯 Attribution : la publication est résolue ICI depuis l'espace actif
//    (publication personnelle du créateur ou média sélectionné), jamais
//    depuis le navigateur — un client ne décide pas de ses stats.
// =====================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import {
  recordFeatureSignalAction as recordSignalSdk,
  getFeatureCatalogAction as getCatalogSdk,
  unsubscribeFeatureAction as unsubscribeSdk,
  getMyFeatureNotificationsAction as getNotifiedSdk,
} from '@qoe/sdk/actions/features';

export type FeatureSignalKind = 'view' | 'notify';

export interface FeatureCatalogState {
  key: string;
  status: string;
  notifyEnabled: boolean;
  notified: boolean;
}

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
  return recordSignalSdk(feature, kind, 'studio', workspace.publisherId);
}

/**
 * État serveur du catalogue : le studio n'affiche pas « Me prévenir » quand
 * l'API a fermé la promesse (paused/retired/notifyEnabled=false).
 */
export async function getFeatureCatalogAction(): Promise<FeatureCatalogState[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return getCatalogSdk();
}

/**
 * Retire la promesse de notification depuis les préférences du compte.
 * Le retrait est immédiat côté serveur ; la page est revalidée pour que la
 * liste des consentements reflète l'état réel, pas un optimisme local.
 */
export async function unsubscribeFeatureAction(feature: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Non autorisé');

  await unsubscribeSdk(feature);
  revalidatePath('/settings');
}

/**
 * Fonctionnalités déjà demandées par l'utilisateur connecté.
 * Une intention est globale au compte (cf. index unique côté Go) : elle
 * survit donc au rechargement et au changement d'espace.
 */
export async function getFeatureNotifiedAction(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return getNotifiedSdk();
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
      `/v1/features/signals/summary?publisherId=${encodeURIComponent(workspace.publisherId)}`
    );
    return res.signals ?? [];
  } catch {
    return [];
  }
}
