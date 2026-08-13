// =====================================================================
// 🧪 Creator API — /v1/analytics/stats
// =====================================================================
// 📖 Statistiques Umami du créateur. Sans umamiWebsiteId, renvoie des
//    zéros (dégradation gracieuse), pas une erreur.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app';
import { creatorHeaders } from '../helpers/auth';

describe('Creator API — GET /v1/analytics/stats', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('renvoie des stats à zéro sans umamiWebsiteId (dégradation gracieuse)', async () => {
    const creator = ctx.seed.user({ id: 'u-creator-1', email: 'creator@qoe.fi' });
    ctx.seed.apiKey('qoe_live_test_creator_key_123', creator);

    const res = await ctx.app.request('/v1/analytics/stats', { headers: creatorHeaders() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { stats: { pageviews: number }; topPages: unknown[] };
    };
    expect(body.data.stats.pageviews).toBe(0);
    expect(body.data.topPages).toEqual([]);
  });

  it('exige une API key valide', async () => {
    const res = await ctx.app.request('/v1/analytics/stats', {
      headers: { Authorization: 'Bearer qoe_live_unknown' },
    });
    expect(res.status).toBe(401);
  });
});
