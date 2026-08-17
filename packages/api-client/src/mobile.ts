// =====================================================================
// 📱 React Native / Expo entry — @qoe/api-client/mobile
// =====================================================================
// ⚠️ Contrairement à l'index racine, ce module n'exporte QUE les parties
//    sans dépendance serveur (Prisma/Supabase/workers) afin de rester
//    compatible Metro / React Native. Les actions serveur (dashboard,
//    admin, tenant…) ne sont volontairement PAS exposées ici.
// =====================================================================

export * from './client';
export * from './types';
export * from './query-keys';
export * from './hooks/useInfiniteFeed';
// Shadow store (optimistic UI) — RN-safe, sans dépendance serveur.
export * from './shadow';
