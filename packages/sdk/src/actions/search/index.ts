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
import { getActivePublisherId } from '../articles';

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
  /** Publication propriétaire du hit (document Meilisearch). */
  publisherId?: string | null;
  categoryId: string | null;
  published: boolean;
  isPremium: boolean;
  /** Couverture indexée (recherche tenant). */
  imageUrl?: string | null;
  /** Temps de lecture indexé, en minutes. */
  readingTime?: number;
  createdAt: number;
  updatedAt: number;
}

/** Mappe un hit Go vers la shape consommée par ThoughtCard. */
function mapThoughtHit(t: SearchThoughtHit): SearchThoughtData {
  return {
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
  };
}

export const searchAllAction = safeAction<
  {
    query: string;
    type?: 'all' | 'thoughts' | 'users' | 'articles';
    limit?: number;
    /** Curseur opaque de la page d'articles (renvoyé par la page précédente). */
    cursor?: string | null;
    /** "mine" restreint les articles à la publication active du créateur (Cmd+K du dashboard). */
    scope?: 'all' | 'mine';
    /** Ne pas interroger les pensées (l'onglet Pensées a sa requête infinie). */
    skipThoughts?: boolean;
    /** Ne pas interroger les articles (l'onglet Articles a sa requête infinie). */
    skipArticles?: boolean;
  },
  {
    thoughts: SearchThoughtData[];
    users: SearchUserHit[];
    articles: SearchArticleHit[];
    /** Curseur de la page de pensées suivante, null en fin de liste. */
    nextCursor: string | null;
    /** Curseur de la page d'articles suivante, null en fin de liste. */
    articlesNextCursor: string | null;
  }
>(
  async (rawInput) => {
    const query = rawInput?.query || '';
    const type = rawInput?.type || 'all';
    // Borne le paramètre transmis au Go : une valeur venue du client pouvait
    // sortir de la fenêtre annoncée (> 50) ou être `NaN`.
    const requestedLimit = Number(rawInput?.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
      : 20;
    const scope = rawInput?.scope || 'all';
    const q = encodeURIComponent(query);

    // Go-only (backend-of-record) : chaque entité a son endpoint public.
    let thoughts: SearchThoughtData[] = [];
    let users: SearchUserHit[] = [];
    let articles: SearchArticleHit[] = [];
    let nextCursor: string | null = null;
    let articlesNextCursor: string | null = null;

    if (!rawInput?.skipThoughts && (type === 'all' || type === 'thoughts')) {
      const res = await goFetch<{ thoughts: SearchThoughtHit[]; nextCursor: string | null }>(
        `/search/thoughts?q=${q}&limit=${limit}`
      );
      thoughts = (res.thoughts ?? []).map(mapThoughtHit);
      nextCursor = res.nextCursor ?? null;
    }

    if (type === 'all' || type === 'users') {
      users = await goFetch<SearchUserHit[]>(`/v1/users/search?q=${q}&limit=${limit}`);
    }

    if (!rawInput?.skipArticles && (type === 'all' || type === 'articles')) {
      // `q` est déjà encodé pour les endpoints en template string plus haut :
      // URLSearchParams encode à son tour, d'où la requête brute ici.
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (rawInput?.cursor) params.set('cursor', rawInput.cursor);
      if (scope === 'mine') {
        try {
          const publisherId = await getActivePublisherId();
          params.set('publisherId', publisherId);
        } catch {
          // publication non résolue → pas de filtre
        }
      }
      const res = await goFetch<{
        hits: SearchArticleHit[];
        estimatedTotalHits: number;
        nextCursor?: string | null;
      }>(`/search/articles?${params.toString()}`);
      articles = res.hits ?? [];
      articlesNextCursor = res.nextCursor ?? null;
    }

    return { thoughts, users, articles, nextCursor, articlesNextCursor };
  },
  { requireAuth: false }
);

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
>(
  async (rawInput) => {
    const limit = rawInput?.limit || 10;
    const res = await goFetch<
      Array<{ id: string; hashtag: string; count: number; createdAt: string; updatedAt: string }>
    >(`/v1/home/trends?limit=${limit}`);
    return { trends: res ?? [] };
  },
  { requireAuth: false }
);

/**
 * Page de pensées seule — sert au bouton « Charger plus » de l'onglet Pensées.
 * `nextCursor` est un offset opaque renvoyé par le Go.
 */
export const searchThoughtsPageAction = safeAction<
  { query: string; cursor?: string | null; limit?: number },
  { thoughts: SearchThoughtData[]; nextCursor: string | null }
>(
  async (rawInput) => {
    const query = rawInput?.query || '';
    if (!query.trim()) {
      return { thoughts: [], nextCursor: null };
    }
    // Borne le paramètre transmis au Go : une valeur venue du client pouvait
    // sortir de la fenêtre annoncée (> 50) ou être `NaN`.
    const requestedLimit = Number(rawInput?.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
      : 20;
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (rawInput?.cursor) params.set('cursor', rawInput.cursor);

    const res = await goFetch<{
      thoughts: SearchThoughtHit[];
      nextCursor?: string | null;
    }>(`/search/thoughts?${params.toString()}`);

    return {
      thoughts: (res.thoughts ?? []).map(mapThoughtHit),
      nextCursor: res.nextCursor ?? null,
    };
  },
  { requireAuth: false }
);

/**
 * Page d'articles seule — sert au bouton « Charger plus » du lecteur.
 * Le curseur est opaque : on renvoie tel quel le `nextCursor` précédent.
 */
export const searchArticlesPageAction = safeAction<
  { query: string; cursor?: string | null; limit?: number },
  {
    articles: SearchArticleHit[];
    nextCursor: string | null;
    estimatedTotalHits: number;
  }
>(
  async (rawInput) => {
    const query = rawInput?.query || '';
    if (!query.trim()) {
      return { articles: [], nextCursor: null, estimatedTotalHits: 0 };
    }
    const limit = rawInput?.limit || 10;
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (rawInput?.cursor) params.set('cursor', rawInput.cursor);

    const res = await goFetch<{
      hits: SearchArticleHit[];
      estimatedTotalHits: number;
      nextCursor?: string | null;
    }>(`/search/articles?${params.toString()}`);

    return {
      articles: res.hits ?? [],
      nextCursor: res.nextCursor ?? null,
      estimatedTotalHits: res.estimatedTotalHits ?? 0,
    };
  },
  { requireAuth: false }
);

/** Article trouvé par similarité sémantique (shape Go GET /search/semantic). */
export interface SearchSemanticHit {
  id: string;
  title: string;
  slug: string;
  isPremium: boolean;
  readingTime: number;
  createdAt: string;
  publisherId: string;
  authorId: string;
  authorName: string | null;
  authorLogo: string | null;
  publisherName: string | null;
  score: number;
}

/**
 * Recherche sémantique (pgvector + embeddings). Retourne une liste vide si le
 * service d'embedding n'est pas configuré : l'action échoue proprement pour
 * que l'UI affiche « indisponible » plutôt qu'un faux « aucun résultat ».
 */
export const searchSemanticAction = safeAction<
  { query: string; limit?: number },
  { items: SearchSemanticHit[] }
>(
  async (rawInput) => {
    const query = rawInput?.query || '';
    if (!query.trim()) return { items: [] };
    const limit = rawInput?.limit || 10;
    const res = await goFetch<{ items: SearchSemanticHit[] }>(
      `/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return { items: res.items ?? [] };
  },
  { requireAuth: false }
);
