import { Hono } from 'hono';
import { MeiliSearch } from 'meilisearch';
import { logger } from '@qoe/observability';

export const searchApp = new Hono();

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY || 'qoe_master_key_123',
});

// Route publique de recherche
searchApp.get('/articles', async (c) => {
  const query = c.req.query('q') || '';
  if (!query) {
    return c.json({ hits: [] });
  }

  try {
    const index = client.index('articles');
    const search = await index.search(query, {
      limit: 10,
    });

    return c.json({
      hits: search.hits,
      estimatedTotalHits: search.estimatedTotalHits,
    });
  } catch (error) {
    logger.error('Erreur recherche Meilisearch', { err: error }, { capture: true });
    return c.json({ error: 'Search failed' }, 500);
  }
});
