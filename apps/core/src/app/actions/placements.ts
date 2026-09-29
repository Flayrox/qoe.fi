'use server';

// =====================================================================
// 🎯 Server Actions Placements In-App (Licorne 2027)
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export interface InAppPlacementDTO {
  id: string;
  slot: string;
  format: 'notch_banner' | 'card' | 'callout' | 'modal';
  type: 'promo' | 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  targetAudience: 'all' | 'free_only' | 'plus_only' | 'pro_only';
  priority: number;
  isActive: boolean;
  dismissible: boolean;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Récupère le placement actif pour un slot donné (injecte le JWT de l'utilisateur).
 */
export async function getPlacementAction(slot: string): Promise<InAppPlacementDTO | null> {
  try {
    const res = await goFetch<InAppPlacementDTO | null>(
      `/v1/placements?slot=${encodeURIComponent(slot)}`
    );
    return res;
  } catch (err) {
    console.error(`[placements] getPlacementAction (${slot}):`, err);
    return null;
  }
}

/**
 * Enregistre l'acquittement d'un placement pour le compte de l'utilisateur.
 */
export async function dismissPlacementAction(placementId: string): Promise<{ success: boolean }> {
  try {
    await goFetch<{ success: boolean }>(
      `/v1/placements/${encodeURIComponent(placementId)}/dismiss`,
      {
        method: 'POST',
      }
    );
    return { success: true };
  } catch (err) {
    console.error(`[placements] dismissPlacementAction (${placementId}):`, err);
    return { success: false };
  }
}
