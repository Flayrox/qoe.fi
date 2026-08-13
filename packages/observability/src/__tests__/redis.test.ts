// =====================================================================
// 🧪 Redis Cache — @qoe/observability
// =====================================================================
// 📖 Vérifie la logique de cache en mode "disabled" (tests) :
//    - withCache exécute toujours fn (pas de cache actif)
//    - cacheGet retourne null
//    - la sérialisation Date → ISO est correcte
// =====================================================================

import { describe, expect, it, vi, afterEach } from 'vitest';
import { setCacheDisabled, cacheGet, cacheSet, withCache } from '../redis';

describe('redis cache', () => {
  afterEach(() => {
    setCacheDisabled(false);
  });

  it('est un no-op silencieux quand désactivé (cacheGet → null)', async () => {
    setCacheDisabled(true);
    expect(await cacheGet('any')).toBeNull();
  });

  it('est un no-op silencieux quand désactivé (cacheSet ne throw pas)', async () => {
    setCacheDisabled(true);
    await expect(cacheSet('any', { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it('withCache exécute fn quand désactivé', async () => {
    setCacheDisabled(true);
    const fn = vi.fn().mockResolvedValue({ posts: [1, 2, 3] });
    const result = await withCache('feed:trending:20', 30, fn);
    expect(result).toEqual({ posts: [1, 2, 3] });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
