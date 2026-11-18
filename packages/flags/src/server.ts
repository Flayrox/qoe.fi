// =====================================================================
// 🖥️ @qoe/flags/server — Évaluation côté serveur (DB partagée + Cache TTL)
// =====================================================================
// 📖 Conçu pour les Server Components, les route handlers Next.js et les
//    workers. Le backend métier est Go (`apps/api`) : ce module ne remplace
//    jamais une règle serveur, il ne sert qu'à lire la table partagée.
//    Les flags sont mis en cache mémoire (60s) puis évalués localement
//    sans appel réseau systématique.
//
// 🎯 Garanties :
//    - Table `feature_flags` absente / DB down → fallback sur FLAGS
//    - Zéro crash, zéro exception levée
//    - Clé inconnue ou héritée du prototype → ignorée (registre fermé)
//    - La carte rendue est GELÉE : un appelant ne peut pas corrompre le cache
// =====================================================================

import { FLAGS, defaultFor, hasFlag, isProtectiveFlag, type FlagKey } from './flags';
import { createClient } from '@qoe/supabase/server';

const CACHE_TTL_MS = 60_000;

type FlagMap = Record<FlagKey, boolean>;

let cache: { flags: Readonly<FlagMap>; at: number } | null = null;

/**
 * Hook de test / reset — vide le cache mémoire TTL.
 */
export function __resetFlagsCache() {
  cache = null;
}

/**
 * Charge les feature flags depuis la table partagée avec dégradation
 * gracieuse sur FLAGS.
 */
export async function loadFlags(): Promise<Readonly<FlagMap>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.flags;
  }

  const result: FlagMap = { ...FLAGS };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('feature_flags').select('key, is_enabled');

    if (!error && data && Array.isArray(data)) {
      for (const row of data) {
        // Registre fermé : une clé inconnue (ou héritée : `toString`,
        // `constructor`, `__proto__`) ne rentre jamais dans la carte.
        if (!row || !hasFlag(row.key)) continue;
        // Booléen strict : `Boolean('false')` (ou `Boolean('0')`) valait
        // `true` et activait un flag coupé.
        if (typeof row.is_enabled !== 'boolean') continue;
        result[row.key] = row.is_enabled;
      }
    }
  } catch {
    // Dégradation gracieuse : en cas d'erreur de connexion, les défauts du registre sont utilisés.
  }

  // Gel : `loadFlags` est partagé par tout le processus (SSR + workers), une
  // mutation d'appelant corromprait les rendus suivants.
  const frozen = Object.freeze(result);
  cache = { flags: frozen, at: Date.now() };
  return frozen;
}

function isAdminBypass(attributes: Record<string, unknown>, key: string): boolean {
  return attributes?.role === 'admin' && !isProtectiveFlag(key);
}

/**
 * Évalue un flag sur un dictionnaire donné (purement synchrone — sans réseau).
 */
export function evaluateFeature<K extends FlagKey>(
  payload: Record<string, unknown> | null,
  key: K,
  attributes: Record<string, unknown> = {}
): boolean {
  // Registre fermé : une clé hors registre n'est jamais évaluée, même si le
  // payload en porte une propriété homonyme (`constructor`, `toString`…).
  if (!hasFlag(key)) return false;
  const fallback = defaultFor(key);
  if (isAdminBypass(attributes, key)) return true;
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) {
    return fallback;
  }

  const val = payload[key];
  if (typeof val === 'boolean') return val;

  // Forme GrowthBook historique : { defaultValue: boolean }.
  if (val && typeof val === 'object') {
    if (Object.prototype.hasOwnProperty.call(val, 'defaultValue')) {
      const dv = (val as { defaultValue?: unknown }).defaultValue;
      return typeof dv === 'boolean' ? dv : fallback;
    }
  }

  // Tout autre type (chaîne, nombre, null) n'est pas interprété : on ne
  // devine pas l'intention d'une valeur mal formée.
  return fallback;
}

/**
 * 🚩 Évalue un flag côté serveur (SSR, API, workers).
 * Ex : await isFlagOn('feed-recommendations', { role: 'admin' })
 */
export async function isFlagOn<K extends FlagKey>(
  key: K,
  attributes: Record<string, unknown> = {}
): Promise<boolean> {
  // Bypass admin sans accès DB — sauf pour les coupe-feux, qui doivent être
  // lus réellement (voir PROTECTIVE_FLAGS).
  if (isAdminBypass(attributes, key)) return true;
  const flags = await loadFlags();
  return evaluateFeature(flags, key);
}

/**
 * Charge tous les flags pour transmission SSR sans flicker.
 */
export async function getAllFlags(): Promise<Readonly<FlagMap>> {
  return loadFlags();
}

/**
 * Alias de compatibilité pour le chargement SSR
 */
export async function getGrowthBookPayload(): Promise<Readonly<FlagMap>> {
  return loadFlags();
}

/**
 * Contexte flags prêt à être injecté dans un middleware ou batch de requêtes.
 */
export async function createFlagsContext(attributes: Record<string, unknown> = {}) {
  const flags = await loadFlags();
  return {
    isOn: (key: FlagKey): boolean => evaluateFeature(flags, key, attributes),
    getAll: (): FlagMap => ({ ...flags }),
  };
}

export { FLAGS, defaultFor };
export type { FlagKey };
