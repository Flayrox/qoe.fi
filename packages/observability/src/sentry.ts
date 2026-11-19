// =====================================================================
// 🪟 Sentry helpers — @qoe/observability
// =====================================================================
// 📖 Initialisation Sentry centralisée pour toutes les surfaces :
//    - initSentryServer : Next.js (server + edge) — apps/*/instrumentation.ts
//    - initSentryNode    : Node pur (route handlers Next.js, scripts)
//    - initSentryClient  : Next.js client — apps/*/sentry.client.config.ts
//    - sentryDsn         : résolution du DSN depuis l'environnement
//
// 🎯 Le DSN n'est JAMAIS commité en dur : lu depuis l'environnement.
//    - serveur/edge : `SENTRY_DSN`
//    - navigateur   : `NEXT_PUBLIC_SENTRY_DSN` — Next.js n'inline QUE les
//      variables `NEXT_PUBLIC_*` dans les bundles client ; sans elle,
//      `initSentryClient()` ne pouvait jamais s'initialiser en production.
//    Sans DSN (dev local), toutes les init deviennent des no-op silencieux.
//
// ⚠️ Le DSN est lu À L'EXÉCUTION, pas au chargement du module : un `.env`
//    chargé après l'import (scripts, tests, workers) était ignoré.
// =====================================================================

export function sentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function sentryEnabled(): boolean {
  return Boolean(sentryDsn());
}

/**
 * Initialise Sentry pour un environnement serveur Next.js
 * (appelé dans `instrumentation.ts` côté server/edge).
 */
export function initSentryServer(dsn = sentryDsn()) {
  if (!dsn) return;
  // Import dynamique : évite de charger @sentry/nextjs dans les builds sans la dep.
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
    });
  });
}

/**
 * Initialise Sentry pour un serveur Node pur (route handlers, scripts).
 */
export function initSentryNode(dsn = sentryDsn()) {
  if (!dsn) return;
  void import('@sentry/node').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
    });
  });
}

/**
 * Initialise Sentry côté client Next.js (replays inclus).
 * Le DSN vient de `NEXT_PUBLIC_SENTRY_DSN` (seule variable exposée au navigateur).
 */
export function initSentryClient(dsn = sentryDsn()) {
  if (!dsn) return;
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
    });
  });
}
