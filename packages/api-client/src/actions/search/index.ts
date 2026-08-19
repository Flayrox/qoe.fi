'use server';

// =====================================================================
// 🔎 actions/search — Server Actions de recherche (web uniquement)
// =====================================================================
// Recherche multi-entités (pensées, utilisateurs, articles) via le dépôt
// `@qoe/db` (recherche SQL + Meilisearch selon l'entité).
// - searchAllAction : recherche combinée, avec `scope: 'mine'` pour
//   restreindre les articles à la publication active du créateur (Cmd+K).
// - getTrendingHashtagsAction : hashtags tendance.
// ⚠️ Fichier serveur : non exposé au mobile (qui passe par l'API Go, cf.
//    apps/api/internal/modules/search).
// =====================================================================

import { search } from '@qoe/db';
import { safeAction } from '../utils/safe-action';
import { getActivePublicationId } from '../articles';

export const searchAllAction = safeAction<
  {
    query: string;
    type?: 'all' | 'thoughts' | 'users' | 'articles';
    limit?: number;
    /** "mine" restreint les articles à la publication active du créateur (Cmd+K du dashboard). */
    scope?: 'all' | 'mine';
  },
  {
    thoughts: Awaited<ReturnType<typeof search.searchThoughts>>['thoughts'];
    users: Awaited<ReturnType<typeof search.searchUsers>>;
    articles: Awaited<ReturnType<typeof search.searchArticles>>;
    nextCursor: string | null;
  }
>(async (rawInput, user) => {
  const query = rawInput?.query || '';
  const type = rawInput?.type || 'all';
  const limit = rawInput?.limit || 20;
  const scope = rawInput?.scope || 'all';

  let thoughts: Awaited<ReturnType<typeof search.searchThoughts>>['thoughts'] = [];
  let users: Awaited<ReturnType<typeof search.searchUsers>> = [];
  let articles: Awaited<ReturnType<typeof search.searchArticles>> = [];
  let nextCursor: string | null = null;

  if (type === 'all' || type === 'thoughts') {
    const res = await search.searchThoughts(query, limit);
    thoughts = res.thoughts;
    nextCursor = res.nextCursor;
  }

  if (type === 'all' || type === 'users') {
    users = await search.searchUsers(query, limit);
  }

  if (type === 'all' || type === 'articles') {
    let publicationId: string | undefined;
    if (scope === 'mine') {
      try {
        publicationId = await getActivePublicationId(user.id);
      } catch {
        publicationId = undefined;
      }
    }
    articles = await search.searchArticles(query, limit, publicationId);
  }

  return { thoughts, users, articles, nextCursor };
});

export const getTrendingHashtagsAction = safeAction<
  { limit?: number } | undefined,
  { trends: Awaited<ReturnType<typeof search.getTrendingHashtags>> }
>(async (rawInput) => {
  const limit = rawInput?.limit || 10;
  const trends = await search.getTrendingHashtags(limit);
  return { trends };
});
