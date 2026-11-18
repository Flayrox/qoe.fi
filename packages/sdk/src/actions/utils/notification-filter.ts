// =====================================================================
// 🔔 notifications/filter — helpers purs du centre de notifications
// =====================================================================
// ⚠️ Fichier volontairement SÉPARÉ de `actions/notifications` : un module
//    `'use server'` ne peut exporter que des fonctions async. Y laisser des
//    constantes ou un validateur synchrone casse la compilation Next
//    (« Export … doesn't exist in target module ») dès qu'un composant
//    client importe l'action. Les helpers purs vivent donc ici, comme
//    `normalizePage` dans `./pagination.ts`.
// =====================================================================

export type NotificationFilter = 'all' | 'mentions' | 'replies' | 'likes' | 'collaborations';

/** Filtres réellement acceptés par le Go (`typeFilter` dans notifications/service.go). */
export const NOTIFICATION_FILTERS: readonly NotificationFilter[] = [
  'all',
  'mentions',
  'replies',
  'likes',
  'collaborations',
];

/** Une valeur hors liste retombe sur « all » : elle ne part jamais dans l'URL. */
export function normalizeNotificationFilter(filter?: string): NotificationFilter {
  return NOTIFICATION_FILTERS.includes(filter as NotificationFilter)
    ? (filter as NotificationFilter)
    : 'all';
}

/** Garde-fou de corps : 500 identifiants suffisent à vider un badge. */
export const MAX_READ_IDS = 500;
