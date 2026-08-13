// =====================================================================
// 📦 @qoe/observability — Logs structurés + Sentry centralisé
// =====================================================================
// 📖 Point unique d'observabilité pour toutes les apps et workers :
//    - logger JSON structuré (niveaux, contexte, timestamp, PII-safe)
//    - wrappers Sentry (init serveur/node/edge)
//    - redirection automatique des erreurs logger → Sentry (quand actif)
//
// 🎯 Consommation :
//    import { logger } from '@qoe/observability';
//    logger.info('Article published', { articleId, durationMs });
//    logger.error('Paywall failure', { articleId }, { capture: true });
// =====================================================================

// =====================================================================
// 📦 @qoe/observability — Logs structurés + Sentry centralisé
// =====================================================================
// 📖 Point unique d'observabilité pour toutes les apps et workers :
//    - logger JSON structuré (niveaux, contexte, timestamp, PII-safe)
//    - wrappers Sentry (init serveur/node/edge)
//
// ⚠️ Le module Redis (server-only, dépend de node:crypto/dns/fs via ioredis)
//    est volontairement EXCLU d'ici pour ne pas fuiter dans les bundles
//    navigateur. Utilise `@qoe/observability/server` pour le cache Redis.
//
// 🎯 Consommation :
//    import { logger } from '@qoe/observability';
//    logger.info('Article published', { articleId, durationMs });
//    logger.error('Paywall failure', { articleId }, { capture: true });
// =====================================================================

export * from './logger';
export * from './sentry';
