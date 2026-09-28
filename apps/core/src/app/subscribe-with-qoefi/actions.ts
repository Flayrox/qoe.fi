'use server';

// =====================================================================
// 📨 Parcours « S'abonner avec qoe.fi » — server actions (fiche 02)
// =====================================================================
// La page lit SA propre session qoe.fi (jamais celle du site tiers) et
// appelle l'API Go authentifiée en JWT. Le site tiers ne reçoit ensuite
// qu'un résultat minimal via postMessage — jamais session, token ni email.

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface QoeSubscribeConfirmResult {
  ok: boolean;
  /** true = abonnement actif immédiatement (adresse vérifiée), false = lien envoyé. */
  active?: boolean;
  error?: string;
}

/**
 * Confirme l'abonnement du compte connecté (POST /v1/me/subscriptions).
 * Le JWT de session est propagé par goFetch ; l'API vérifie que l'adresse
 * demandée est exactement celle du compte et qu'elle est confirmée côté
 * fournisseur avant toute activation directe.
 */
export async function subscribeWithQoeFiAction(input: {
  email: string;
  publicationId: string;
}): Promise<QoeSubscribeConfirmResult> {
  try {
    const res = await goFetch<{ success: boolean; active: boolean }>('/v1/me/subscriptions', {
      method: 'POST',
      body: input,
    });
    return { ok: true, active: res.active };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Abonnement impossible.' };
  }
}

export interface PublicationProfile {
  id: string;
  name: string;
  logoUrl: string | null;
}

/**
 * Profil public minimal d'une publication (nom + logo, rien de sensible)
 * pour afficher « Confirmer l'abonnement à [publication] ». Sans auth.
 */
export async function getSubscribePublicationProfile(
  slugOrId: string
): Promise<PublicationProfile | null> {
  try {
    const res = await goFetch<PublicationProfile>(
      `/v1/publications/${encodeURIComponent(slugOrId)}/profile`
    );
    if (!res?.id) return null;
    return res;
  } catch {
    return null;
  }
}
