// =====================================================================
// 🖥️ @qoe/flags/server — Évaluation côté serveur (Supabase + Cache TTL)
// =====================================================================
// 📖 Conçu pour les Server Components, l'API Hono et les workers BullMQ.
//    Les flags sont mis en cache mémoire (60s) puis évalués localement
//    sans appel réseau systématique.
//
// 🎯 Garanties :
//    - Table Supabase absente / DB down → fallback gracieux sur FLAGS par défaut
//    - Zéro crash, zéro exception levée
//    - Support natif du ciblage (ex: role: 'admin')
// =====================================================================

import { FLAGS, defaultFor, type FlagKey } from './flags';
import { createClient } from '@qoe/supabase/server';

const CACHE_TTL_MS = 60_000;
let cache: { flags: Record<FlagKey, boolean>; at: number } | null = null;

/**
 * Hook de test / reset — vide le cache mémoire TTL.
 */
export function __resetGrowthBookCache() {
  cache = null;
}

export function __resetFlagsCache() {
  cache = null;
}

/**
 * Charge les feature flags depuis Supabase avec dégradation gracieuse sur FLAGS.
 */
export async function loadFlags(): Promise<Record<FlagKey, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.flags;
  }

  const result: Record<string, boolean> = { ...FLAGS };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('feature_flags').select('key, is_enabled');

    if (!error && data && Array.isArray(data)) {
      for (const row of data) {
        if (row && typeof row.key === 'string' && row.key in FLAGS) {
          result[row.key as FlagKey] = Boolean(row.is_enabled);
        }
      }
    }
  } catch {
    // Dégradation gracieuse : en cas d'erreur de connexion, les défauts du registre sont utilisés
  }

  cache = { flags: result as Record<FlagKey, boolean>, at: now };
  return result as Record<FlagKey, boolean>;
}

/**
 * Évalue un flag sur un dictionnaire donné (purement synchrone — sans réseau).
 */
export function evaluateFeature<K extends FlagKey>(
  payload: Record<string, unknown> | null,
  key: K,
  attributes: Record<string, unknown> = {}
): boolean {
  if (attributes?.role === 'admin') return true;
  if (payload && key in payload) {
    const val = payload[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object' && val !== null && 'defaultValue' in val) {
      return Boolean((val as { defaultValue: unknown }).defaultValue);
    }
    return Boolean(val);
  }
  return defaultFor(key);
}

/**
 * 🚩 Évalue un flag côté serveur (SSR, API, workers).
 * Ex : await isFlagOn('feed-recommendations', { role: 'admin' })
 */
export async function isFlagOn<K extends FlagKey>(
  key: K,
  attributes: Record<string, unknown> = {}
): Promise<boolean> {
  if (attributes?.role === 'admin') return true;
  const flags = await loadFlags();
  return evaluateFeature(flags, key, attributes);
}

/**
 * Charge tous les flags pour transmission SSR sans flicker.
 */
export async function getAllFlags(): Promise<Record<FlagKey, boolean>> {
  return loadFlags();
}

/**
 * Alias de compatibilité pour le chargement SSR
 */
export async function getGrowthBookPayload(): Promise<Record<FlagKey, boolean>> {
  return loadFlags();
}

/**
 * Contexte flags prêt à être injecté dans un middleware ou batch de requêtes.
 */
export async function createFlagsContext(attributes: Record<string, unknown> = {}) {
  const flags = await loadFlags();
  return {
    isOn: (key: FlagKey): boolean => evaluateFeature(flags, key, attributes),
    getAll: () => ({ ...flags }),
  };
}

export { FLAGS, defaultFor };
export type { FlagKey };
