// =====================================================================
// 🔑 query-keys.ts — Clés de cache TanStack Query (web + mobile)
// =====================================================================
// Registre central des clés de cache : chaque domaine métier a sa famille
// de clés (feed, users, tenants, articles, notifications, recherche…).
// VALEUR : l'invalidation et les updates optimistes ciblent ces familles
// (`queryClient.invalidateQueries({ queryKey: feedKeys.all })`), donc
// renommer une clé ici casse silencieusement le cache — attention.
// ⚠️ Le mobile importe ce module via `@qoe/sdk/mobile` : ajouter une
//    famille de clés ici la rend disponible au React Query de l'app mobile.
// =====================================================================

export const feedKeys = {
  all: ['feed'] as const,
  timeline: (type: 'for-you' | 'following' | 'highlights' = 'for-you') =>
    [...feedKeys.all, 'timeline', type] as const,
  userPosts: (username: string) => [...feedKeys.all, 'user', username] as const,
  thread: (thoughtId: string) => [...feedKeys.all, 'thread', thoughtId] as const,
  likes: (thoughtId: string) => [...feedKeys.all, 'likes', thoughtId] as const,
  articles: () => [...feedKeys.all, 'articles'] as const,
};

export const userKeys = {
  all: ['users'] as const,
  profile: (username: string) => [...userKeys.all, 'profile', username] as const,
  followers: (username: string) => [...userKeys.all, 'followers', username] as const,
  following: (username: string) => [...userKeys.all, 'following', username] as const,
};

export const tenantKeys = {
  all: ['tenants'] as const,
  domain: (domain: string) => [...tenantKeys.all, 'domain', domain] as const,
  articles: (domain: string) => [...tenantKeys.all, 'articles', domain] as const,
  article: (domain: string, slug: string) => [...tenantKeys.all, 'article', domain, slug] as const,
};

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  status: (creatorId: string, email?: string) =>
    [...subscriptionKeys.all, 'status', creatorId, email || 'anonymous'] as const,
  tiers: (creatorId: string) => [...subscriptionKeys.all, 'tiers', creatorId] as const,
};

export const recommendationKeys = {
  all: ['recommendations'] as const,
  creator: (recommenderId: string) =>
    [...recommendationKeys.all, 'creator', recommenderId] as const,
};

export const articleKeys = {
  all: ['articles'] as const,
  comments: (articleId: string) => [...articleKeys.all, articleId, 'comments'] as const,
  highlights: (articleId: string) => [...articleKeys.all, articleId, 'highlights'] as const,
};

export const commentKeys = {
  all: ['comments'] as const,
  list: (articleId: string) => [...commentKeys.all, 'list', articleId] as const,
};

export const annotationKeys = {
  all: ['annotations'] as const,
  article: (articleId: string) => [...annotationKeys.all, 'article', articleId] as const,
};

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filter?: string) => [...notificationKeys.all, 'list', filter || 'all'] as const,
  unreadCount: () => [...notificationKeys.all, 'unreadCount'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
};

export const searchKeys = {
  all: ['search'] as const,
  results: (query: string, type?: string) =>
    [...searchKeys.all, 'results', query, type || 'all'] as const,
  trending: () => [...searchKeys.all, 'trending'] as const,
};

export const starterPackKeys = {
  all: ['starterPacks'] as const,
  list: () => [...starterPackKeys.all, 'list'] as const,
  detail: (id: string) => [...starterPackKeys.all, 'detail', id] as const,
};

export const pollKeys = {
  all: ['polls'] as const,
  detail: (thoughtId: string) => [...pollKeys.all, 'detail', thoughtId] as const,
};

export const threadgateKeys = {
  all: ['threadgates'] as const,
  canReply: (thoughtId: string) => [...threadgateKeys.all, 'canReply', thoughtId] as const,
};
