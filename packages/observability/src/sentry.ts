// =====================================================================
// 🪟 Sentry helpers — @qoe/observability
// =====================================================================
// 📖 Initialisation Sentry centralisée pour toutes les surfaces :
//    - initSentryServer : Next.js (server + edge) — apps/*/instrumentation.ts
//    - initSentryNode    : Node pur (Hono API, workers BullMQ)
//    - initSentryClient  : Next.js client — apps/*/sentry.client.config.ts
//    - sentryDsn         : résolution du DSN depuis l'environnement
//
// 🎯 Le DSN n'est JAMAIS commité en dur : lu depuis SENTRY_DSN (env).
//    Sans DSN (dev local), toutes les init deviennent des no-op silencieux.
// =====================================================================

const ENV_DSN = process.env.SENTRY_DSN;

export function sentryDsn(): string | undefined {
  return ENV_DSN;
}

export function sentryEnabled(): boolean {
  return Boolean(ENV_DSN);
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
 * Initialise Sentry pour un serveur Node pur (Hono API, workers).
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
