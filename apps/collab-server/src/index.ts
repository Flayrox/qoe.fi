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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config';
import { PostgresDatabase, MemoryDatabase, type CollabDatabase } from './database';
import { createSupabaseVerifier } from './auth';
import { createPublicationAccessChecker } from './permissions';
import { createCollabServer } from './server';

/**
 * Charge les `.env` locaux avant la config.
 *
 * `tsx` ne lit aucun fichier d'environnement : sans ce chargement, le serveur
 * démarrait sans `SUPABASE_URL` ni `DATABASE_URL`, refusait **tous** les tokens
 * (l'introspection n'avait pas d'URL) et perdait les documents à chaque
 * redémarrage (base mémoire). Les variables déjà présentes dans le processus
 * restent prioritaires : en production, l'environnement réel gagne toujours.
 */
function loadEnvFiles(): void {
  // Build CommonJS : `__dirname` pointe sur src/ (dev) ou dist/ (build), deux
  // niveaux de même profondeur, donc les mêmes chemins relatifs fonctionnent.
  const here = typeof __dirname === 'string' ? __dirname : process.cwd();
  const candidates = [resolve(here, '../.env'), resolve(here, '../../../.env')];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

const config = loadConfig();

// Sans URL Supabase, TOUS les tokens sont refusés (l'introspection n'a pas de
// cible) : le symptôme apparaît côté client comme « token invalide ». On le
// dit une fois, clairement, au démarrage.
if (!config.supabaseUrl) {
  console.error(
    '[collab-server] SUPABASE_URL absente : aucune connexion ne pourra être authentifiée.'
  );
}
if (!config.databaseUrl) {
  console.warn(
    '[collab-server] DATABASE_URL absente : les documents seront perdus au redémarrage.'
  );
}

// ─── Persistance ─────────────────────────────────────────────────────
// Sans DATABASE_URL (dev rapide), on retombe sur une base mémoire.
const database: CollabDatabase = config.databaseUrl
  ? new PostgresDatabase(config.databaseUrl)
  : new MemoryDatabase();

// ─── Auth (introspection Supabase) ───────────────────────────────────
const verifier = createSupabaseVerifier(config.supabaseUrl, config.supabaseAnonKey);

// ─── RBAC publication (qui peut éditer) ──────────────────────────────
// Seulement quand la persistance Postgres est active (pas de mode mémoire).
const canEditDocument =
  database instanceof PostgresDatabase ? createPublicationAccessChecker(database.pool) : undefined;

const server = createCollabServer({
  database,
  verifier,
  maxDocumentBytes: config.maxDocumentBytes,
  canEditDocument,
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
