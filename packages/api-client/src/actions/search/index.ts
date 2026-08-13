'use server';

import { search } from '@qoe/db';
import { safeAction } from '../utils/safe-action';

export const searchAllAction = safeAction<
  { query: string; type?: 'all' | 'thoughts' | 'users' | 'articles'; limit?: number },
  {
    thoughts: Awaited<ReturnType<typeof search.searchThoughts>>['thoughts'];
    users: Awaited<ReturnType<typeof search.searchUsers>>;
    articles: Awaited<ReturnType<typeof search.searchArticles>>;
    nextCursor: string | null;
  }
>(async (rawInput) => {
  const query = rawInput?.query || '';
  const type = rawInput?.type || 'all';
  const limit = rawInput?.limit || 20;

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
    articles = await search.searchArticles(query, limit);
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
