// ═══════════════════════════════════════════════════════════════════
// 📊 @qoe/brand — studio.ts
// Définitions sémantiques et constantes visuelles pour le Studio Créateur.
// Permet d'unifier les icônes de métriques, analytics, audiences et clés API.
// ═══════════════════════════════════════════════════════════════════

export interface StudioMetricDefinition {
  key: string;
  label: string;
  description?: string;
  suggestedLucideIcon: string;
  category: 'analytics' | 'audience' | 'developer' | 'publishing';
}

/**
 * Registre des métriques & entités du Studio Créateur qoe.fi
 */
export const STUDIO_ENTITIES: Record<string, StudioMetricDefinition> = {
  // ─── Analytics ───
  views: {
    key: 'views',
    label: 'Vues totales',
    suggestedLucideIcon: 'Eye',
    category: 'analytics',
  },
  uniqueReaders: {
    key: 'uniqueReaders',
    label: 'Lecteurs uniques',
    suggestedLucideIcon: 'Users',
    category: 'analytics',
  },
  readTime: {
    key: 'readTime',
    label: 'Temps de lecture moyen',
    suggestedLucideIcon: 'Clock',
    category: 'analytics',
  },
  completionRate: {
    key: 'completionRate',
    label: 'Taux de lecture complète',
    suggestedLucideIcon: 'TrendingUp',
    category: 'analytics',
  },
  referrers: {
    key: 'referrers',
    label: 'Sources de trafic',
    suggestedLucideIcon: 'Globe',
    category: 'analytics',
  },
  devices: {
    key: 'devices',
    label: 'Appareils',
    suggestedLucideIcon: 'Smartphone',
    category: 'analytics',
  },

  // ─── Audience & Abonnés ───
  subscribers: {
    key: 'subscribers',
    label: 'Abonnés',
    suggestedLucideIcon: 'Users',
    category: 'audience',
  },
  newsletterSubs: {
    key: 'newsletterSubs',
    label: 'Abonnés Newsletter',
    suggestedLucideIcon: 'Mail',
    category: 'audience',
  },
  paidMembers: {
    key: 'paidMembers',
    label: 'Membres Premium',
    suggestedLucideIcon: 'CreditCard',
    category: 'audience',
  },

  // ─── Développeur & Clés API ───
  apiKeys: {
    key: 'apiKeys',
    label: 'Clés API',
    description: 'Accès programmatique et tokens de service',
    suggestedLucideIcon: 'Key',
    category: 'developer',
  },
  webhooks: {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Événements temps réel sortants',
    suggestedLucideIcon: 'Webhook',
    category: 'developer',
  },
  oauthApps: {
    key: 'oauthApps',
    label: 'Applications OAuth',
    description: 'Clients OAuth 2.0 connectés',
    suggestedLucideIcon: 'Shield',
    category: 'developer',
  },

  // ─── Publication ───
  articles: {
    key: 'articles',
    label: 'Articles',
    suggestedLucideIcon: 'FileText',
    category: 'publishing',
  },
  thoughts: {
    key: 'thoughts',
    label: 'Pensées',
    suggestedLucideIcon: 'MessageCircle',
    category: 'publishing',
  },
  newsletters: {
    key: 'newsletters',
    label: 'Newsletters',
    suggestedLucideIcon: 'Mail',
    category: 'publishing',
  },
} as const;
