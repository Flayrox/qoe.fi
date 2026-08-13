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

export * from './logger';
export * from './sentry';
