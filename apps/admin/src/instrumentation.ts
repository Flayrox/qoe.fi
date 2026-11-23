// =====================================================================
// 🪟 Sentry instrumentation — apps/admin
// =====================================================================
// 📖 Initialise Sentry côté serveur/edge (importé par Next.js automatiquement).
//    No-op silencieux si SENTRY_DSN n'est pas défini (dev local).
//
// ⚠️ `onRequestError` DOIT être exporté ici : c'est le seul point par lequel
//    Next.js 16 transmet une erreur de Server Component, de Server Action ou
//    de route handler. Sans cet export, l'erreur n'existe que dans les logs du
//    conteneur et n'atteint jamais Sentry. Le corps du rapporteur vient du SDK
//    (`captureRequestError`), jamais d'une copie locale.
// =====================================================================

import { captureRequestError, initSentryServer } from '@qoe/observability';

export async function register() {
  // Attendu : `register` doit se terminer après `Sentry.init`, sinon les
  // erreurs du tout début du démarrage sont perdues.
  await initSentryServer();
}

export const onRequestError = captureRequestError;
