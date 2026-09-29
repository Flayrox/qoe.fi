'use server';

// =====================================================================
// 🎫 actions/entitlements — droits du compte pour les gates front
// =====================================================================
// UNE source pour tous les gates (TTS, thèmes, quotas) : { plus }.
// Le backend décide (octroi direct ou publication Pro possédée) ; le front
// met en cache court (le statut change rarement — octroi/révocation staff).
// =====================================================================

import { goFetch } from './utils/go-client';
import { safeAction } from './utils/safe-action';

export interface MyEntitlements {
  plus: boolean;
}

/** Droits du compte connecté (lecture seule). */
export const getMyEntitlementsAction = safeAction<void, MyEntitlements>(async () => {
  return goFetch<MyEntitlements>('/v1/me/entitlements');
});
