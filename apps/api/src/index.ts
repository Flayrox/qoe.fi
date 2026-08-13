// =====================================================================
// 🔌 API Server — apps/api (Hono) — Bootstrap
// =====================================================================
// 📖 Construit l'app (voir app.ts pour les routes et le DI) et démarre
//    le serveur HTTP. Les tests importent `createApp` depuis ./app
//    sans démarrer de serveur.
// =====================================================================

import { serve } from '@hono/node-server';
import { initSentryNode, logger } from '@qoe/observability';
import { app } from './app';

// Initialise Sentry (no-op silencieux sans SENTRY_DSN en dev local)
initSentryNode();

const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  logger.info('API server running', { port: info.port });
});
