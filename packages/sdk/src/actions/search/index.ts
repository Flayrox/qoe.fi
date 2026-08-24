'use server';

// =====================================================================
// 🔎 actions/search — Server Actions de recherche (web uniquement)
// =====================================================================
// Recherche multi-entités (pensées, utilisateurs, articles) via l'API Go.
// - searchAllAction : recherche combinée, avec `scope: 'mine'` pour
//   restreindre les articles à la publication active du créateur (Cmd+K).
// - getTrendingHashtagsAction : hashtags tendance.
// ⚠️ Fichier serveur : non exposé au mobile (qui passe par l'API Go, cf.
//    apps/api/internal/modules/search).
// =====================================================================

import { safeAction } from '../utils/safe-action';
import { goFetch } from '../utils/go-client';
import { getActivePublicationId } from '../articles';

/** Pensée trouvée (shape Go GET /search/thoughts). */
export interface SearchThoughtHit {
  id: string;
  content: string;
  tags: string[];
  imageUrl: string | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorLogo: string | null;
  isCertified: boolean;
  likeCount: number;
  repostCount: number;
  replyCount: number;
}

/** Utilisateur trouvé (shape Go GET /v1/users/search). */
export interface SearchUserHit {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified: boolean;
  slug: string | null;
  subdomain: string | null;
  heroText: string | null;
}

/** Pensée mappée vers ThoughtData (shape ThoughtCard). */
export type SearchThoughtData = {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    username: string | null;
    name: string | null;
    subdomain: string | null;
    customDomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  liked?: boolean;
  triggerWarning?: string | null;
  imageUrl?: string | null;
  tags?: string[];
};

/** Article trouvé (hit Meilisearch Go GET /search/articles). */
export interface SearchArticleHit {
  id: string;
  title: string;
  slug: string;
  content: string;
  authorId: string;
  categoryId: string | null;
  published: boolean;
  isPremium: boolean;
  createdAt: number;
  updatedAt: number;
}

export const searchAllAction = safeAction<
  {
    query: string;
    type?: 'all' | 'thoughts' | 'users' | 'articles';
    limit?: number;
    /** "mine" restreint les articles à la publication active du créateur (Cmd+K du dashboard). */
    scope?: 'all' | 'mine';
  },
  {
    thoughts: SearchThoughtData[];
    users: SearchUserHit[];
    articles: SearchArticleHit[];
    nextCursor: string | null;
  }
>(async (rawInput) => {
  const query = rawInput?.query || '';
  const type = rawInput?.type || 'all';
  const limit = rawInput?.limit || 20;
  const scope = rawInput?.scope || 'all';
  const q = encodeURIComponent(query);

  // Go-only (backend-of-record) : chaque entité a son endpoint public.
  let thoughts: SearchThoughtData[] = [];
  let users: SearchUserHit[] = [];
  let articles: SearchArticleHit[] = [];
  let nextCursor: string | null = null;

  if (type === 'all' || type === 'thoughts') {
    const res = await goFetch<{ thoughts: SearchThoughtHit[]; nextCursor: string | null }>(
      `/search/thoughts?q=${q}&limit=${limit}`
    );
    thoughts = (res.thoughts ?? []).map((t) => ({
      id: t.id,
      content: t.content,
      authorId: t.authorId,
      author: {
        id: t.authorId,
        username: t.authorUsername ?? t.authorName,
        name: t.authorName,
        subdomain: null,
        logoUrl: t.authorLogo,
        isCertified: t.isCertified,
      },
      createdAt: t.createdAt,
      likeCount: t.likeCount,
      repostCount: t.repostCount,
      replyCount: t.replyCount,
      liked: false,
      triggerWarning: null,
      imageUrl: t.imageUrl,
      tags: t.tags ?? [],
    }));
    nextCursor = res.nextCursor ?? null;
  }

  if (type === 'all' || type === 'users') {
    users = await goFetch<SearchUserHit[]>(`/v1/users/search?q=${q}&limit=${limit}`);
  }

  if (type === 'all' || type === 'articles') {
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (scope === 'mine') {
      try {
        const publicationId = await getActivePublicationId();
        params.set('publicationId', publicationId);
      } catch {
        // publication non résolue → pas de filtre
      }
    }
    const res = await goFetch<{ hits: SearchArticleHit[]; estimatedTotalHits: number }>(
      `/search/articles?${params.toString()}`
    );
    articles = res.hits ?? [];
  }

  return { thoughts, users, articles, nextCursor };
});

export const getTrendingHashtagsAction = safeAction<
  { limit?: number } | undefined,
  {
    trends: Array<{
      id: string;
      hashtag: string;
      count: number;
      createdAt: string;
      updatedAt: string;
    }>;
  }
>(async (rawInput) => {
  const limit = rawInput?.limit || 10;
  const res = await goFetch<
    Array<{ id: string; hashtag: string; count: number; createdAt: string; updatedAt: string }>
  >(`/v1/home/trends?limit=${limit}`);
  return { trends: res ?? [] };
});
