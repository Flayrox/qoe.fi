// =====================================================================
// 🗄️ PostgresDatabase — Persistance des documents Yjs
// =====================================================================
// Implémente l'interface `Database` attendue par `@hocuspocus/extension-database`.
// Chaque nom de document (ex: `article:{uuid}`) correspond à une ligne dans
// la table `collab_documents` : l'état Yjs est stocké en binaire (BYTEA).
//
// La table est créée par la migration goose (apps/api/migrations) :
//   *_collab_documents.sql
// On fait aussi un CREATE TABLE IF NOT EXISTS ici pour que le serveur
// fonctionne même si la migration n'a pas encore été appliquée (dev).
// =====================================================================

import { Pool } from 'pg';

export interface CollabDatabase {
  findDocument(documentName: string): Promise<Uint8Array | null | undefined>;
  storeDocument(documentName: string, state: Uint8Array): Promise<void>;
  updateDocument(documentName: string, state: Uint8Array): Promise<void>;
  deleteDocument(documentName: string): Promise<void>;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS collab_documents (
    document_name TEXT PRIMARY KEY,
    state BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export class PostgresDatabase implements CollabDatabase {
  /** Pool pg exposé pour les autres services (ex: RBAC publication). */
  readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string, poolSize = 5, injectedPool?: Pool) {
    this.pool = injectedPool ?? new Pool({ connectionString, max: poolSize });
    // Évite un crash Node non rattrapé lorsqu'une connexion idle du pool coupe.
    this.pool.on('error', (error: unknown) => {
      console.error('[collab-server] Erreur client Postgres idle :', error);
    });
    // Le CREATE TABLE IF NOT EXISTS est idempotent et attendu avant toute requête.
    this.ready = this.pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error('[collab-server] Impossible de garantir la table collab_documents :', error);
      });
  }

  /** Charge l'état Yjs persisté d'un document, ou undefined s'il n'existe pas. */
  async findDocument(documentName: string): Promise<Uint8Array | null | undefined> {
    await this.ready;
    const result = await this.pool.query(
      'SELECT state FROM collab_documents WHERE document_name = $1',
      [documentName]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return new Uint8Array(row.state);
  }

  /** Persiste l'état initial d'un document (création). */
  async storeDocument(documentName: string, state: Uint8Array): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO collab_documents (document_name, state, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (document_name) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [documentName, Buffer.from(state)]
    );
  }

  /** Persiste un nouvel état (update incrémental envoyé par Hocuspocus). */
  async updateDocument(documentName: string, state: Uint8Array): Promise<void> {
    await this.storeDocument(documentName, state);
  }

  /** Supprime un document (ex: article supprimé). */
  async deleteDocument(documentName: string): Promise<void> {
    await this.ready;
    await this.pool.query('DELETE FROM collab_documents WHERE document_name = $1', [documentName]);
  }

  /** Ferme proprement le pool (appelé au shutdown). */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Fallback mémoire (pas de DATABASE_URL en dev) — perdu au redémarrage. */
export class MemoryDatabase implements CollabDatabase {
  private readonly store = new Map<string, Uint8Array>();

  async findDocument(documentName: string): Promise<Uint8Array | null | undefined> {
    return this.store.get(documentName);
  }

  async storeDocument(documentName: string, state: Uint8Array): Promise<void> {
    this.store.set(documentName, state);
  }

  async updateDocument(documentName: string, state: Uint8Array): Promise<void> {
    this.store.set(documentName, state);
  }

  async deleteDocument(documentName: string): Promise<void> {
    this.store.delete(documentName);
  }
}
