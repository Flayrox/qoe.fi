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

import { logger } from './logger';

type SentryNext = typeof import('@sentry/nextjs');
type RequestErrorArgs = Parameters<SentryNext['captureRequestError']>;

export function sentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function sentryEnabled(): boolean {
  return Boolean(sentryDsn());
}

/**
 * Initialise Sentry pour un environnement serveur Next.js
 * (appelé dans `instrumentation.ts` côté server/edge).
 *
 * ⚠️ Rend la promesse d'initialisation : `register()` doit l'attendre. Un
 * import dynamique lancé sans être attendu rendait la main avant que
 * `Sentry.init` n'ait tourné — les erreurs du tout début du démarrage
 * (chargement de config, première requête) n'étaient jamais capturées.
 */
export async function initSentryServer(dsn = sentryDsn()): Promise<void> {
  if (!dsn) return;
  try {
    // Import dynamique : évite de charger @sentry/nextjs dans les builds sans la dep.
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
    });
  } catch (error) {
    logger.error('sentry.server_init_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Rapporteur d'erreur de requête pour `instrumentation.ts` :
 *
 * ```ts
 * export const onRequestError = captureRequestError;
 * ```
 *
 * 📖 Next.js n'appelle `onRequestError` que si `instrumentation.ts` l'exporte :
 * sans lui, une erreur levée dans un Server Component, une Server Action ou un
 * route handler n'atteint jamais Sentry (elle n'existe que dans les logs du
 * conteneur). La signature est celle du SDK, volontairement reprise telle
 * quelle pour qu'un changement de contrat casse le typecheck.
 */
export async function captureRequestError(...args: RequestErrorArgs): Promise<void> {
  try {
    const Sentry = await import('@sentry/nextjs');
    await Sentry.captureRequestError(...args);
  } catch (error) {
    logger.error('sentry.request_error_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
