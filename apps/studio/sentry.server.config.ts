// =====================================================================
// 🪟 Sentry server — apps/studio
// =====================================================================
// 📖 Initialise Sentry côté serveur. No-op silencieux sans SENTRY_DSN.
//    (Utilisé par la v10 de @sentry/nextjs quand instrumentation.ts
//     n'est pas encore pris en charge par la config du build.)
// =====================================================================

import { initSentryServer } from '@qoe/observability';

initSentryServer();
