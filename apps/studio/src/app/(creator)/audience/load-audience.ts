// =====================================================================
// 📥 Lecture de l'audience — apps/studio/src/app/(creator)/audience/
// =====================================================================
// 📖 Go : GET /v1/analytics/audience/subscribers?publisherId=…
//
// ⚠️ Une panne du module analytics ne doit pas rendre la page inaccessible :
//    l'écran affiche une liste vide **expliquée** et garde le reste utilisable.
//    Le résultat porte donc `unavailable`, que l'écran rend en bandeau — un
//    tableau vide sans explication ferait croire à zéro abonné.
// =====================================================================

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { SubscriberItem } from './AudienceClient';

export interface SubscriberDTO {
  id: string;
  email: string;
  isActive: boolean;
  isPremium: boolean;
  ltvCents: number;
  createdAt: string;
}

export interface AudienceSnapshot {
  subscribers: SubscriberItem[];
  unavailable: boolean;
}

export function toSubscriberItems(dtos: SubscriberDTO[] | undefined | null): SubscriberItem[] {
  return (dtos ?? []).map((sub) => ({
    id: sub.id,
    email: sub.email,
    isActive: sub.isActive,
    isPremium: sub.isPremium,
    ltvCents: sub.ltvCents || 0,
    createdAt: sub.createdAt,
  }));
}

export async function loadAudience(publisherId: string): Promise<AudienceSnapshot> {
  try {
    const res = await goFetch<{ subscribers: SubscriberDTO[] }>(
      `/v1/analytics/audience/subscribers?publisherId=${encodeURIComponent(publisherId)}`
    );
    return { subscribers: toSubscriberItems(res.subscribers), unavailable: false };
  } catch (err) {
    console.error('[audience] liste des abonnés indisponible:', err);
    return { subscribers: [], unavailable: true };
  }
}
