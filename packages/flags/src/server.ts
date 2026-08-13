// =====================================================================
// 🖥️ @qoe/flags/server — Évaluation côté serveur
// =====================================================================
// 📖 Conçu pour les Server Components, l'API Hono et les workers BullMQ.
//    Le payload des features est chargé une fois (cache 60s) puis évalué
//    localement à chaque appel — zéro réseau par requête après le 1er.
//
// 🎯 Garanties :
//    - Sans GROWTHBOOK_API_HOST / GROWTHBOOK_CLIENT_KEY → return défaut
//    - GrowthBook injoignable → return défaut (timeout 2s, jamais de throw)
//    - `getGrowthBookPayload()` : hydrate le provider client (SSR, no-flicker)
// =====================================================================

import { GrowthBook, type GrowthBookPayload } from '@growthbook/growthbook';
import { FLAGS, defaultFor, type FlagKey } from './flags';

const CACHE_TTL_MS = 60_000;

let cache: { payload: GrowthBookPayload | null; at: number } | null = null;

function sdkConfig(): { apiHost: string; clientKey: string } | null {
  const apiHost = process.env.GROWTHBOOK_API_HOST;
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;
  if (!apiHost || !clientKey) return null;
  return { apiHost, clientKey };
}

async function loadPayload(): Promise<GrowthBookPayload | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.payload;

  const cfg = sdkConfig();
  if (!cfg) {
    cache = { payload: null, at: now };
    return null;
  }

  try {
    const gb = new GrowthBook({ apiHost: cfg.apiHost, clientKey: cfg.clientKey });
    await gb.init({ timeout: 2000 });
    // En cas d'échec, getDecryptedPayload() renvoie {} → evaluateFeature
    // retombe sur les valeurs par défaut du registre. Dégradation gracieuse.
    const payload = gb.getDecryptedPayload();
    gb.destroy();
    cache = { payload, at: now };
    return payload;
  } catch {
    cache = { payload: null, at: now };
    return null;
  }
}

/**
 * Évalue un flag sur un payload donné (purement synchrone — testable sans réseau).
 */
export function evaluateFeature<K extends FlagKey>(
  payload: GrowthBookPayload | null,
  key: K,
  attributes: Record<string, unknown> = {}
): boolean {
  const gb = new GrowthBook({ attributes }).initSync({
    payload: payload ?? { features: {} },
  });
  const value = gb.getFeatureValue(key, defaultFor(key));
  gb.destroy();
  return Boolean(value);
}

/**
 * 🚩 Évalue un flag côté serveur (SSR, API, workers).
 * Ex : await isFlagOn('feed-recommendations', { userId, plan })
 */
export async function isFlagOn<K extends FlagKey>(
  key: K,
  attributes: Record<string, unknown> = {}
): Promise<boolean> {
  const payload = await loadPayload();
  return evaluateFeature(payload, key, attributes);
}

/**
 * Payload décrypté pour hydrater le provider client (no-flicker SSR).
 * Renvoie null si GrowthBook est indisponible → les hooks retombent sur
 * les valeurs par défaut du registre.
 */
export async function getGrowthBookPayload(): Promise<GrowthBookPayload | null> {
  return loadPayload();
}

/**
 * Contexte flags prêt à être injecté dans un middleware (API Hono, workers).
 * Les attributs sont figés à la création ; ré-évalue chaque clé sans réseau.
 */
export async function createFlagsContext(attributes: Record<string, unknown> = {}) {
  const payload = await loadPayload();
  return {
    isOn: (key: FlagKey): boolean => evaluateFeature(payload, key, attributes),
  };
}

/** Hook de test — vide le cache TTL. */
export function __resetGrowthBookCache() {
  cache = null;
}

export { FLAGS, defaultFor };
export type { FlagKey };
