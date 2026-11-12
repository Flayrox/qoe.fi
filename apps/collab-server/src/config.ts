// =====================================================================
// ⚙️ Config — Variables d'environnement du serveur de collaboration
// =====================================================================
// Le serveur Hocuspocus ne dépend que de deux choses :
//   1. DATABASE_URL  → persistance des documents Yjs (Postgres / Supabase)
//   2. SUPABASE_URL  → introspection du JWT (GET /auth/v1/user) pour l'auth
// =====================================================================

function env(name: string, fallback = ''): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback) return fallback;
    // On ne crash pas au démarrage pour permettre un mode "memory only" en dev.
    console.warn(`[collab-server] Variable d'environnement manquante : ${name}`);
    return '';
  }
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[collab-server] Valeur invalide pour ${name} (« ${raw} »), fallback=${fallback}`);
    return fallback;
  }
  return parsed;
}

export interface CollabConfig {
  /** Port du serveur WebSocket. */
  port: number;
  /** Connexion Postgres (utilisée pour persister les documents Yjs). */
  databaseUrl: string;
  /** URL de l'instance Supabase (introspection JWT). */
  supabaseUrl: string;
  /** Clé anon Supabase pour l'introspection (apikey header). */
  supabaseAnonKey: string;
  /** Taille maximale d'un document (octets) — garde-fou anti-abuse. */
  maxDocumentBytes: number;
  /** Taille maximale d'un message WebSocket (octets). */
  maxMessageBytes: number;
  /** Nombre maximal de messages par fenêtre de 10s et par connexion. */
  maxMessagesPerWindow: number;
  /** Nombre maximal de connexions simultanées par utilisateur. */
  maxConnsPerUser: number;
  /** Nombre maximal de connexions simultanées par IP. */
  maxConnsPerIP: number;
}

export function loadConfig(): CollabConfig {
  return {
    port: Number(env('COLLAB_PORT', '15406')),
    databaseUrl: env('DATABASE_URL'),
    supabaseUrl: env('SUPABASE_URL', env('NEXT_PUBLIC_SUPABASE_URL')),
    supabaseAnonKey: env(
      'SUPABASE_ANON_KEY',
      env('NEXT_PUBLIC_SUPABASE_ANON_KEY', env('SUPABASE_SERVICE_ROLE_KEY'))
    ),
    maxDocumentBytes: envInt('COLLAB_MAX_DOCUMENT_BYTES', 8 * 1024 * 1024),
    maxMessageBytes: envInt('COLLAB_MAX_MESSAGE_BYTES', 131_072),
    maxMessagesPerWindow: envInt('COLLAB_MAX_MESSAGES_PER_10S', 120),
    maxConnsPerUser: envInt('COLLAB_MAX_CONNS_PER_USER', 10),
    maxConnsPerIP: envInt('COLLAB_MAX_CONNS_PER_IP', 25),
  };
}
