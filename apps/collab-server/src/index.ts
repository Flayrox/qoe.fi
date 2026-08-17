// =====================================================================
// 🧵 Serveur de collaboration temps réel — Hocuspocus (Yjs)
// =====================================================================
// Co-édition des articles du dashboard (TipTap Collaboration).
//
//   - Transport : WebSocket (connexions persistantes, Yjs sync protocol)
//   - Persistance : Postgres (`collab_documents`), état Yjs binaire
//   - Auth : JWT Supabase validé par introspection (`/auth/v1/user`)
//   - Présence : awareness Yjs natif (curseurs, compteur d'éditeurs)
//
// Lancement :
//   DATABASE_URL="postgresql://…" SUPABASE_URL="https://….supabase.co" \
//     COLLAB_PORT=1234 pnpm --filter @qoe/collab-server dev
// =====================================================================

import { loadConfig } from './config';
import { PostgresDatabase, MemoryDatabase, type CollabDatabase } from './database';
import { createSupabaseVerifier } from './auth';
import { createCollabServer } from './server';

const config = loadConfig();

// ─── Persistance ─────────────────────────────────────────────────────
// Sans DATABASE_URL (dev rapide), on retombe sur une base mémoire.
const database: CollabDatabase = config.databaseUrl
  ? new PostgresDatabase(config.databaseUrl)
  : new MemoryDatabase();

// ─── Auth (introspection Supabase) ───────────────────────────────────
const verifier = createSupabaseVerifier(config.supabaseUrl);

const server = createCollabServer({
  database,
  verifier,
  maxDocumentBytes: config.maxDocumentBytes,
});

server
  .listen(config.port)
  .then(() => {
    console.log(
      `[collab-server] Hocuspocus prêt sur ws://0.0.0.0:${config.port}` +
        (database instanceof MemoryDatabase ? ' (persistance mémoire)' : ' (Postgres)')
    );
  })
  .catch((error: unknown) => {
    console.error('[collab-server] Échec du démarrage :', error);
    process.exit(1);
  });

// ─── Shutdown propre (SIGTERM / SIGINT) ───────────────────────────────
async function shutdown(signal: string) {
  console.log(`[collab-server] ${signal} reçu, arrêt…`);
  try {
    await server.destroy();
    if (database instanceof PostgresDatabase) await database.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
