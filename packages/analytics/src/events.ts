// =====================================================================
// 📊 Events — Catalogue des events trackés
// =====================================================================
// 📖 Source unique de vérité : un event = un nom + ses propriétés typées.
//    Évite les fautes de frappe ("signup_complted" vs "signup_completed").
// =====================================================================

/**
 * 📋 Catalogue des events métier.
 * Ajoute tes events ici au fur et à mesure.
 */
export const EVENTS = {
  // Auth
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN_COMPLETED: 'login_completed',
  LOGOUT: 'logout',

  // Onboarding
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Articles
  ARTICLE_PUBLISHED: 'article_published',
  ARTICLE_VIEWED: 'article_viewed',
  ARTICLE_BOOKMARKED: 'article_bookmarked',
  ARTICLE_HIGHLIGHTED: 'article_highlighted',

  // Posts
  POST_CREATED: 'post_created',
  POST_LIKED: 'post_liked',
  POST_REPLIED: 'post_replied',
  POST_REPOSTED: 'post_reposted',

  // Social
  USER_FOLLOWED: 'user_followed',
  USER_UNFOLLOWED: 'user_unfollowed',
  USER_BLOCKED: 'user_blocked',

  // Billing
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYOUT_REQUESTED: 'payout_requested',

  // Tenant
  TENANT_PAGE_VIEWED: 'tenant_page_viewed',
  TENANT_ARTICLE_READ: 'tenant_article_read',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * 📦 Props communes à tous les events.
 */
export type BaseEventProps = {
  userId?: string;
  timestamp?: string;
  source?: 'web' | 'console' | 'api' | 'worker';
};

/**
 * 📦 Props spécifiques par event.
 */
export type EventProps = {
  [EVENTS.SIGNUP_COMPLETED]: BaseEventProps & { method: 'email' | 'google' | 'github' };
  [EVENTS.ONBOARDING_STEP_COMPLETED]: BaseEventProps & { step: string };
  [EVENTS.ARTICLE_VIEWED]: BaseEventProps & { articleId: string; durationMs?: number };
  [EVENTS.POST_CREATED]: BaseEventProps & { postId: string; length: number };
  [EVENTS.PAYMENT_COMPLETED]: BaseEventProps & { amountCents: number; currency: string };
  [EVENTS.SUBSCRIPTION_STARTED]: BaseEventProps & { creatorId: string; tier: string };
  // ... etc
};
