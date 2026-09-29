import { getMyEntitlementsAction } from '@qoe/sdk';

// =====================================================================
// 🎫 Statut Plus — logique pure (cache + déduplication), sans React
// =====================================================================
// UN SEUL appel /v1/me/entitlements par session, quel que soit le nombre
// de gates (TTS, thèmes, quotas). false par défaut et en cas d'erreur
// (dégradation ouverte : jamais de blocage, upsell informatif).
// Testé en node (vitest core = node, pas de DOM) ; le hook use-plus.ts
// n'est qu'un binding fin au-dessus.
// =====================================================================

let cached: boolean | null | undefined;
let inflight: Promise<boolean> | null = null;

export async function fetchPlusStatus(): Promise<boolean> {
  if (cached !== undefined) return cached ?? false;
  if (!inflight) {
    inflight = getMyEntitlementsAction()
      .then((res) => {
        cached = res.ok ? res.data.plus : false;
        return cached ?? false;
      })
      .catch(() => {
        cached = false;
        return false;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Réinitialise le cache (tests uniquement — jamais en prod). */
export function __resetPlusCacheForTests(): void {
  cached = undefined;
  inflight = null;
}
