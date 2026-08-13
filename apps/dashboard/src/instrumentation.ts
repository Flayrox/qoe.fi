// =====================================================================
// 🪟 Sentry instrumentation — apps/dashboard
// =====================================================================
// 📖 Initialise Sentry côté serveur/edge (importé par Next.js automatiquement).
//    No-op silencieux si SENTRY_DSN n'est pas défini (dev local).
// =====================================================================

import { initSentryServer } from '@qoe/observability';

export async function register() {
  initSentryServer();
}
