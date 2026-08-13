// =====================================================================
// 🔌 API Server — apps/api (Hono) — Bootstrap
// =====================================================================
// 📖 Construit l'app (voir app.ts pour les routes et le DI) et démarre
//    le serveur HTTP. Les tests importent `createApp` depuis ./app
//    sans démarrer de serveur.
// =====================================================================

import { serve } from '@hono/node-server';
import { app } from './app';

const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🔌 API server running on http://localhost:${info.port}`);
});
