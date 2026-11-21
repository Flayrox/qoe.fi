// =====================================================================
// ⚙️ Config — Variables d'environnement du serveur de collaboration
// =====================================================================
// Le serveur Hocuspocus ne dépend que de deux choses :
//   1. DATABASE_URL  → persistance des documents Yjs (Postgres / Supabase)
//   2. SUPABASE_URL  → introspection du JWT (GET /auth/v1/user) pour l'auth
// =====================================================================

function envFirst(names: string[], fallback?: string): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  if (fallback !== undefined) return fallback;
  console.warn(`[collab-server] Variable d'environnement manquante : ${names.join(' / ')}`);
  return '';
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

function envPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[collab-server] Port invalide pour ${name} (« ${raw} »), fallback=${fallback}`);
    return fallback;
  }
  return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
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
  /** Faut-il faire confiance aux en-têtes proxy (X-Real-IP / X-Forwarded-For) ? */
  trustProxy: boolean;
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
    port: envPort('COLLAB_PORT', 15406),
    databaseUrl: envFirst(['DATABASE_URL']),
    supabaseUrl: envFirst(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']),
    supabaseAnonKey: envFirst(['SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'], ''),
    trustProxy: envBool('COLLAB_TRUST_PROXY', false),
    maxDocumentBytes: envInt('COLLAB_MAX_DOCUMENT_BYTES', 8 * 1024 * 1024),
    maxMessageBytes: envInt('COLLAB_MAX_MESSAGE_BYTES', 131_072),
    maxMessagesPerWindow: envInt('COLLAB_MAX_MESSAGES_PER_10S', 120),
    maxConnsPerUser: envInt('COLLAB_MAX_CONNS_PER_USER', 10),
    maxConnsPerIP: envInt('COLLAB_MAX_CONNS_PER_IP', 25),
  };
}

/**
 * En production, le serveur doit échouer immédiatement (fail-closed) si la base
 * ou l'URL d'introspection Supabase manque, plutôt que de démarrer en mode
 * mémoire ou de rejeter silencieusement toutes les connexions.
 */
export function validateProductionConfig(
  config: CollabConfig,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string[] {
  if (nodeEnv !== 'production') return [];
  const errors: string[] = [];
  if (!config.databaseUrl) {
    errors.push('[collab-server] DATABASE_URL obligatoire en production.');
  }
  if (!config.supabaseUrl) {
    errors.push('[collab-server] SUPABASE_URL obligatoire en production.');
  }
  // Sans clé anon, `auth.ts` envoie le JWT du client en `apikey` : Supabase le
  // refuse, et le serveur refuse alors **toutes** les connexions en annonçant
  // « token invalide » — panne silencieuse au démarrage.
  if (!config.supabaseAnonKey) {
    errors.push(
      '[collab-server] SUPABASE_ANON_KEY obligatoire en production ' +
        "(sans elle, l'introspection est refusée et aucune connexion n'aboutit)."
    );
  }
  return errors;
}
