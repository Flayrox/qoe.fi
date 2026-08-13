// =====================================================================
// 🗄️ Redis Cache — @qoe/observability
// =====================================================================
// 📖 Client Redis partagé + helpers de cache JSON avec TTL.
//    Utilisé par les repos DB pour cacher les requêtes chaudes du feed.
//
// 🎯 Garanties :
//    - Singleton du client ioredis (pas de fuite de connexions)
//    - Sérialisation JSON automatique (Date → ISO)
//    - No-op silencieux si Redis n'est pas joignable (dégradation gracieuse)
//    - `withCache` : memoize une fonction avec clé + TTL, sans casser les tests
//    - ⚠️ ioredis est importé dynamiquement : ce module ne fuit JAMAIS
//      ioredis dans un bundle navigateur (import dynamique = lazy chunk)
// =====================================================================

import { logger } from './logger';
import type IORedis from 'ioredis';

let client: IORedis | null = null;

let disabled = false;

/**
 * Désactive le cache (utilisé par les tests pour isoler).
 */
export function setCacheDisabled(value: boolean) {
  disabled = value;
}

function redisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

/**
 * Charge ioredis dynamiquement (uniquement côté serveur, à l'appel).
 */
async function loadRedis() {
  if (disabled) return null;
  if (client) return client;

  // Import dynamique : absent des bundles client (jamais exécuté côté nav).
  const { default: IORedis } = await import('ioredis');
  const instance = new IORedis(redisUrl(), {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 500, 5000);
    },
  });

  instance.on('error', (err: Error) => {
    logger.error('Erreur Redis cache', { message: err.message });
  });

  instance.connect().catch((err: Error) => {
    logger.warn('Connexion Redis cache échouée (dégradation)', { message: err.message });
  });

  client = instance;
  return instance;
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (val instanceof Date ? val.toISOString() : val));
}

/**
 * Lit une valeur en cache. Retourne `null` si absente ou si Redis KO.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = await loadRedis();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Écrit une valeur en cache avec un TTL (secondes).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const c = await loadRedis();
  if (!c) return;
  try {
    await c.set(key, serialize(value), 'EX', ttlSeconds);
  } catch {
    // Silencieux : le cache est best-effort.
  }
}

/**
 * Supprime une ou plusieurs clés du cache.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const c = await loadRedis();
  if (!c || keys.length === 0) return;
  try {
    await c.del(keys);
  } catch {
    // Silencieux.
  }
}

/**
 * Vide toutes les clés préfixées (invalidation de namespace).
 * Ex : invalidateNamespace('feed:trending:') supprime toutes les variantes.
 */
export async function cacheInvalidateNamespace(prefix: string): Promise<void> {
  const c = await loadRedis();
  if (!c) return;
  try {
    const keys: string[] = [];
    const stream = c.scanStream({ match: `${prefix}*`, count: 100 });
    for await (const batch of stream) {
      keys.push(...batch);
    }
    if (keys.length > 0) {
      await c.del(keys);
    }
  } catch {
    // Silencieux.
  }
}

/**
 * Enveloppe une fonction async avec cache : si la clé est en cache, retourne
 * le résultat caché ; sinon exécute `fn`, stocke le résultat et le retourne.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await cacheSet(key, result, ttlSeconds);
  return result;
}
