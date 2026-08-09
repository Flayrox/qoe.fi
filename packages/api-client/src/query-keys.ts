export const feedKeys = {
  all: ['feed'] as const,
  timeline: (type: 'for-you' | 'following' | 'highlights' = 'for-you') => [...feedKeys.all, 'timeline', type] as const,
  userPosts: (username: string) => [...feedKeys.all, 'user', username] as const,
  thread: (thoughtId: string) => [...feedKeys.all, 'thread', thoughtId] as const,
  likes: (thoughtId: string) => [...feedKeys.all, 'likes', thoughtId] as const,
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
  status: (creatorId: string, email?: string) => [...subscriptionKeys.all, 'status', creatorId, email || 'anonymous'] as const,
  tiers: (creatorId: string) => [...subscriptionKeys.all, 'tiers', creatorId] as const,
};
